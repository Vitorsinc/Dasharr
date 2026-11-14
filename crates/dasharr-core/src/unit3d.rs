//! Trackers UNIT3D con los trackers y tokens que ya tiene Prowlarr: estadísticas del usuario (`GET /api/user`) y
//! torrents en freeleech o doble subida (`GET /api/torrents/filter`).
//! El token y los enlaces de descarga (llevan la clave RSS) nunca salen de este módulo: no se serializan ni se
//! escriben en el registro.

use std::time::Duration;

use reqwest::{header, StatusCode};
use serde::Serialize;
use serde_json::Value;

use crate::model::FetchedTorrent;
use crate::url::join_url;
use crate::ApiError;

const TIMEOUT: Duration = Duration::from_secs(15);
/// Valor con el que Prowlarr enmascara los campos privados de sus indexadores nativos.
const MASKED: &str = "********";

/// Tracker de Prowlarr que puede ser UNIT3D: definición Cardigann con campo `apikey`.
#[derive(Clone)]
pub struct Unit3dSource {
    pub indexer_id: i64,
    pub name: String,
    pub base_url: String,
    api_key: String,
}

impl std::fmt::Debug for Unit3dSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Unit3dSource").field("indexer_id", &self.indexer_id).field("name", &self.name).finish()
    }
}

fn field<'a>(indexer: &'a Value, name: &str) -> Option<&'a Value> {
    indexer["fields"].as_array()?.iter().find(|f| f["name"] == name).map(|f| &f["value"])
}

fn non_empty(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

/// Saca de `GET /api/v1/indexer` de Prowlarr los indexadores habilitados que guardan un token `apikey` en claro.
pub fn unit3d_sources(indexers: &Value) -> Vec<Unit3dSource> {
    let Some(list) = indexers.as_array() else { return Vec::new() };
    list.iter()
        .filter(|i| i["enable"] == true && i["implementation"] == "Cardigann" && i["protocol"] == "torrent")
        .filter_map(|i| {
            let api_key = non_empty(field(i, "apikey")).filter(|k| k != MASKED)?;
            let base_url = non_empty(field(i, "baseUrl")).or_else(|| non_empty(i["indexerUrls"].get(0)))?;
            Some(Unit3dSource {
                indexer_id: i["id"].as_i64()?,
                name: i["name"].as_str().unwrap_or("?").to_string(),
                base_url,
                api_key,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrackerStatus {
    Ok,
    /// 401: token incorrecto o revocado.
    Unauthorized,
    /// 404 o una respuesta que no es la de UNIT3D: el tracker no ofrece estas estadísticas.
    Unsupported,
    /// 429: se ha superado el límite de peticiones del tracker.
    RateLimited,
    /// Caído, Cloudflare, mantenimiento, 403...
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerUser {
    pub username: String,
    pub group: String,
    pub uploaded: Option<u64>,
    pub downloaded: Option<u64>,
    /// `None` cuando el tracker dice `∞` (no se ha bajado nada).
    pub ratio: Option<f64>,
    /// Puede ser negativo (por debajo del ratio mínimo). `None` si es `∞` o no se entiende.
    pub buffer: Option<i64>,
    pub buffer_infinite: bool,
    pub seeding: Option<u64>,
    pub leeching: Option<u64>,
    pub seedbonus: Option<f64>,
    pub hit_and_runs: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStats {
    pub indexer_id: i64,
    pub name: String,
    pub site_url: String,
    pub status: TrackerStatus,
    pub message: Option<String>,
    pub user: Option<TrackerUser>,
}

fn number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().replace(',', "").parse().ok(),
        _ => None,
    }
}

fn count(v: &Value) -> Option<u64> {
    number(v).filter(|n| *n >= 0.0).map(|n| n as u64)
}

/// Tamaño de UNIT3D en bytes: número o texto como `"1.25 TiB"` (con espacio normal o no separable).
pub fn parse_size(v: &Value) -> Option<i64> {
    if let Value::Number(n) = v {
        return n.as_f64().map(|n| n as i64);
    }
    let s = v.as_str()?.replace('\u{a0}', " ");
    let s = s.trim();
    let split = s.find(|c: char| c.is_ascii_alphabetic()).unwrap_or(s.len());
    let amount: f64 = s[..split].trim().replace(',', "").parse().ok()?;
    let exp = match s[split..].trim().to_ascii_uppercase().as_str() {
        "" | "B" => 0,
        "KIB" | "KB" => 1,
        "MIB" | "MB" => 2,
        "GIB" | "GB" => 3,
        "TIB" | "TB" => 4,
        "PIB" | "PB" => 5,
        _ => return None,
    };
    Some((amount * 1024f64.powi(exp)).round() as i64)
}

fn is_infinite(v: &Value) -> bool {
    v.as_str().is_some_and(|s| s.trim() == "∞" || s.trim().eq_ignore_ascii_case("inf"))
}

/// Interpreta la respuesta de `GET /api/user`. `None` si no tiene pinta de UNIT3D.
pub fn parse_user(body: &Value) -> Option<TrackerUser> {
    body.get("uploaded")?;
    body.get("downloaded")?;
    let text = |k: &str| body[k].as_str().unwrap_or_default().to_string();
    Some(TrackerUser {
        username: text("username"),
        group: text("group"),
        uploaded: parse_size(&body["uploaded"]).map(|b| b.max(0) as u64),
        downloaded: parse_size(&body["downloaded"]).map(|b| b.max(0) as u64),
        ratio: if is_infinite(&body["ratio"]) { None } else { number(&body["ratio"]) },
        buffer_infinite: is_infinite(&body["buffer"]),
        buffer: parse_size(&body["buffer"]),
        seeding: count(&body["seeding"]),
        leeching: count(&body["leeching"]),
        seedbonus: number(&body["seedbonus"]),
        hit_and_runs: count(&body["hit_and_runs"]),
    })
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("Dasharr/", env!("CARGO_PKG_VERSION")))
        // Una redirección aquí es la web (login, Cloudflare), no la API.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("cliente HTTP")
}

/// Consulta `GET {base}/api/user` con el token del tracker y clasifica la respuesta.
pub async fn fetch_stats(http: &reqwest::Client, src: &Unit3dSource) -> TrackerStats {
    let (status, message, user) = match query(http, src).await {
        Ok(user) => (TrackerStatus::Ok, None, Some(user)),
        Err((status, message)) => (status, Some(message), None),
    };
    // Solo nombre y resultado: la URL y el token no van al registro.
    match status {
        TrackerStatus::Ok => log::debug!("unit3d {}: estadísticas leídas", src.name),
        _ => log::warn!("unit3d {}: {:?} ({})", src.name, status, message.as_deref().unwrap_or("")),
    }
    TrackerStats { indexer_id: src.indexer_id, name: src.name.clone(), site_url: src.base_url.clone(), status, message, user }
}

async fn query(http: &reqwest::Client, src: &Unit3dSource) -> Result<TrackerUser, (TrackerStatus, String)> {
    let body = get_json(http, src, "/api/user", &[], "este tracker no ofrece estadísticas por la API").await?;
    parse_user(&body).ok_or((TrackerStatus::Unsupported, NOT_UNIT3D.into()))
}

const NOT_UNIT3D: &str = "la respuesta no es la API de UNIT3D";

/// `GET {base}{path}` con el token y clasifica la respuesta. `missing` es el mensaje para un 404.
async fn get_json(
    http: &reqwest::Client,
    src: &Unit3dSource,
    path: &str,
    query: &[(&str, &str)],
    missing: &str,
) -> Result<Value, (TrackerStatus, String)> {
    use TrackerStatus::*;
    let url = join_url(&src.base_url, path).map_err(|e| (Unavailable, e.to_string()))?;
    let res = http
        .get(url)
        .query(query)
        .bearer_auth(&src.api_key)
        .header(header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| (Unavailable, format!("no responde: {}", e.without_url())))?;
    let status = res.status();
    match status {
        StatusCode::UNAUTHORIZED => return Err((Unauthorized, "el tracker no acepta el token guardado en Prowlarr".into())),
        StatusCode::NOT_FOUND => return Err((Unsupported, missing.into())),
        StatusCode::TOO_MANY_REQUESTS => return Err((RateLimited, "demasiadas peticiones, prueba en unos minutos".into())),
        StatusCode::FORBIDDEN => return Err((Unavailable, "el tracker ha rechazado el acceso (403)".into())),
        s if s.is_redirection() => return Err((Unavailable, "el tracker redirige a su web en vez de responder la API".into())),
        s if !s.is_success() => return Err((Unavailable, format!("error HTTP {}", s.as_u16()))),
        _ => {}
    }
    let text = res.text().await.map_err(|e| (Unavailable, e.without_url().to_string()))?;
    serde_json::from_str(&text).map_err(|_| (Unsupported, NOT_UNIT3D.to_string()))
}

// ---------------------------------------------------------------------------------------------------------------
// Freeleech y doble subida

/// Torrent en freeleech o con doble subida. Sin enlace de descarga: se pide aparte con [`fetch_torrent_file`].
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unit3dDeal {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    /// Tipo de release (Remux, WEB-DL, Encode...).
    pub release_type: Option<String>,
    pub resolution: Option<String>,
    pub size: Option<u64>,
    /// Porcentaje de freeleech: 0, 25, 50, 75 o 100.
    pub freeleech: u8,
    pub double_upload: bool,
    pub seeders: Option<u64>,
    pub leechers: Option<u64>,
    pub completed: Option<u64>,
    pub created_at: Option<String>,
    /// Póster pequeño de TMDB (solo https).
    pub poster: Option<String>,
    pub tmdb_id: Option<i64>,
    /// Ficha del torrent en la web del tracker.
    pub details_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerDeals {
    pub indexer_id: i64,
    pub name: String,
    pub status: TrackerStatus,
    pub message: Option<String>,
    pub torrents: Vec<Unit3dDeal>,
}

/// Torrents que se piden por tracker en cada consulta (freeleech y doble subida van por separado).
const DEALS_PER_PAGE: &str = "50";

fn truthy(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => matches!(s.trim(), "1" | "true" | "yes"),
        _ => false,
    }
}

fn text_opt(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn https(v: &Value) -> Option<String> {
    text_opt(v).filter(|u| u.starts_with("https://") && !u.contains("placeholder"))
}

/// Interpreta una página de `GET /api/torrents/filter` y se queda con lo que está en freeleech o doble subida
/// (un tracker que ignore el filtro devolvería de todo). `None` si no tiene pinta de UNIT3D.
pub fn parse_deals(body: &Value) -> Option<Vec<Unit3dDeal>> {
    let data = body.get("data")?.as_array()?;
    Some(
        data.iter()
            .filter_map(|item| {
                let a = item.get("attributes")?;
                let id = match &item["id"] {
                    Value::Number(n) => n.as_i64()?,
                    Value::String(s) => s.parse().ok()?,
                    _ => return None,
                };
                // "100%" en UNIT3D; un número en forks.
                let freeleech = match &a["freeleech"] {
                    Value::String(s) => s.trim().trim_end_matches('%').trim().parse::<f64>().ok(),
                    v => number(v),
                }
                .unwrap_or(0.0)
                .clamp(0.0, 100.0) as u8;
                let double_upload = truthy(&a["double_upload"]);
                if freeleech == 0 && !double_upload {
                    return None;
                }
                Some(Unit3dDeal {
                    id,
                    name: text_opt(&a["name"])?,
                    category: text_opt(&a["category"]),
                    release_type: text_opt(&a["type"]),
                    resolution: text_opt(&a["resolution"]),
                    size: parse_size(&a["size"]).map(|b| b.max(0) as u64),
                    freeleech,
                    double_upload,
                    seeders: count(&a["seeders"]),
                    leechers: count(&a["leechers"]),
                    completed: count(&a["times_completed"]),
                    created_at: text_opt(&a["created_at"]),
                    poster: https(&a["meta"]["poster"]),
                    tmdb_id: number(&a["tmdb_id"]).map(|n| n as i64).filter(|n| *n > 0),
                    details_url: text_opt(&a["details_link"]).filter(|u| u.starts_with("http://") || u.starts_with("https://")),
                })
            })
            .collect(),
    )
}

async fn deals_page(http: &reqwest::Client, src: &Unit3dSource, filter: &[(&str, &str)]) -> Result<Vec<Unit3dDeal>, (TrackerStatus, String)> {
    let mut query = vec![("perPage", DEALS_PER_PAGE), ("sortField", "created_at"), ("sortDirection", "desc")];
    query.extend_from_slice(filter);
    let body = get_json(http, src, "/api/torrents/filter", &query, "este tracker no permite buscar torrents por la API").await?;
    parse_deals(&body).ok_or((TrackerStatus::Unsupported, NOT_UNIT3D.into()))
}

/// Torrents en freeleech (cualquier porcentaje) y con doble subida de un tracker: dos peticiones, sin repetidos.
pub async fn fetch_deals(http: &reqwest::Client, src: &Unit3dSource) -> TrackerDeals {
    let free = [("free[]", "25"), ("free[]", "50"), ("free[]", "75"), ("free[]", "100")];
    let (free, double) = tokio::join!(deals_page(http, src, &free), deals_page(http, src, &[("doubleup", "1")]));
    let (status, message, torrents) = match (free, double) {
        (Err((status, message)), Err(_)) => (status, Some(message), Vec::new()),
        (a, b) => {
            let mut out: Vec<Unit3dDeal> = Vec::new();
            for d in a.unwrap_or_default().into_iter().chain(b.unwrap_or_default()) {
                if !out.iter().any(|x| x.id == d.id) {
                    out.push(d);
                }
            }
            (TrackerStatus::Ok, None, out)
        }
    };
    match status {
        TrackerStatus::Ok => log::debug!("unit3d {}: {} torrents en freeleech o doble subida", src.name, torrents.len()),
        _ => log::warn!("unit3d {}: freeleech {:?} ({})", src.name, status, message.as_deref().unwrap_or("")),
    }
    TrackerDeals { indexer_id: src.indexer_id, name: src.name.clone(), status, message, torrents }
}

fn api_error((status, message): (TrackerStatus, String)) -> ApiError {
    let code = match status {
        TrackerStatus::Unauthorized => 401,
        TrackerStatus::Unsupported => 404,
        TrackerStatus::RateLimited => 429,
        _ => 502,
    };
    ApiError::Http { status: code, message }
}

fn same_host(a: &url::Url, b: &url::Url) -> bool {
    a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

/// Descarga el .torrent de un torrent del tracker para subirlo a qBittorrent: lee su enlace de descarga
/// (`GET /api/torrents/{id}`) y lo baja. El enlace lleva la clave RSS del usuario y no sale de aquí.
pub async fn fetch_torrent_file(http: &reqwest::Client, src: &Unit3dSource, torrent_id: i64) -> Result<FetchedTorrent, ApiError> {
    let body = get_json(http, src, &format!("/api/torrents/{torrent_id}"), &[], "el torrent ya no existe en el tracker")
        .await
        .map_err(api_error)?;
    let attrs = body.get("attributes").or_else(|| body["data"].get("attributes"));
    let link = attrs
        .and_then(|a| text_opt(&a["download_link"]))
        .ok_or_else(|| ApiError::Http { status: 502, message: "el tracker no da enlace de descarga para este torrent".into() })?;
    let link = url::Url::parse(&link).map_err(|e| ApiError::network(format!("enlace no válido: {e}")))?;
    let base = join_url(&src.base_url, "").map_err(ApiError::network)?;
    // El enlace va a la web del propio tracker; si apuntase a otro sitio no se sigue.
    if !same_host(&link, &base) {
        return Err(ApiError::Http { status: 502, message: "el enlace de descarga no apunta al tracker".into() });
    }
    let res = http.get(link).send().await.map_err(|e| ApiError::network(e.without_url()))?;
    let status = res.status();
    if status.is_redirection() {
        let location = res.headers().get(header::LOCATION).and_then(|v| v.to_str().ok()).unwrap_or_default();
        if location.starts_with("magnet:") {
            return Ok(FetchedTorrent::Magnet(location.to_string()));
        }
        return Err(ApiError::Http { status: status.as_u16(), message: "el tracker redirige a su web en vez de dar el torrent".into() });
    }
    if !status.is_success() {
        return Err(ApiError::Http { status: status.as_u16(), message: "el tracker no ha dado el archivo .torrent".into() });
    }
    let bytes = res.bytes().await.map_err(|e| ApiError::network(e.without_url()))?;
    // Un .torrent es un diccionario bencode: empieza por "d".
    if bytes.first() != Some(&b'd') {
        return Err(ApiError::Http { status: 502, message: "el tracker no ha devuelto un archivo .torrent".into() });
    }
    use base64::Engine;
    Ok(FetchedTorrent::File(base64::engine::general_purpose::STANDARD.encode(&bytes)))
}
