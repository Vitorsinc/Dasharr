//! Estadísticas del usuario en trackers UNIT3D (`GET /api/user`), con los trackers y tokens que ya tiene Prowlarr.
//! El token nunca sale de este módulo: no se serializa ni se escribe en el registro.

use std::time::Duration;

use reqwest::{header, StatusCode};
use serde::Serialize;
use serde_json::Value;

use crate::url::join_url;

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
    use TrackerStatus::*;
    let url = join_url(&src.base_url, "/api/user").map_err(|e| (Unavailable, e.to_string()))?;
    let res = http
        .get(url)
        .bearer_auth(&src.api_key)
        .header(header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| (Unavailable, format!("no responde: {}", e.without_url())))?;
    let status = res.status();
    match status {
        StatusCode::UNAUTHORIZED => return Err((Unauthorized, "el tracker no acepta el token guardado en Prowlarr".into())),
        StatusCode::NOT_FOUND => return Err((Unsupported, "este tracker no ofrece estadísticas por la API".into())),
        StatusCode::TOO_MANY_REQUESTS => return Err((RateLimited, "demasiadas peticiones, prueba en unos minutos".into())),
        StatusCode::FORBIDDEN => return Err((Unavailable, "el tracker ha rechazado el acceso (403)".into())),
        s if s.is_redirection() => return Err((Unavailable, "el tracker redirige a su web en vez de responder la API".into())),
        s if !s.is_success() => return Err((Unavailable, format!("error HTTP {}", s.as_u16()))),
        _ => {}
    }
    let text = res.text().await.map_err(|e| (Unavailable, e.without_url().to_string()))?;
    let body: Value = serde_json::from_str(&text).map_err(|_| (Unsupported, "la respuesta no es la API de UNIT3D".to_string()))?;
    parse_user(&body).ok_or((Unsupported, "la respuesta no es la API de UNIT3D".into()))
}
