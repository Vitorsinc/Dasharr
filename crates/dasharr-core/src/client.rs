use std::time::{Duration, Instant};

use base64::Engine;
use reqwest::{header, Method, StatusCode};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::error::ApiError;
use crate::model::{ApiBody, ApiRequest, ApiResponse, Route, ServiceConfig, ServiceKind, ServiceSecrets};
use crate::url::join_url;

const LOCAL_PROBE_TIMEOUT: Duration = Duration::from_millis(1500);
const REMOTE_PROBE_TIMEOUT: Duration = Duration::from_secs(8);
// La búsqueda manual de releases en Radarr/Sonarr puede tardar más de un minuto.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
struct Resolved {
    route: Route,
    base: Option<String>,
}

/// Cookie de sesión de qBittorrent como par `nombre=valor`. Hasta la 4.x se llama `SID`;
/// desde la 5.x incluye el puerto (`QBT_SID_8080`).
fn session_cookie(pair: &str) -> Option<String> {
    let (name, value) = pair.split_once('=')?;
    let is_session = name == "SID" || name.starts_with("QBT_SID");
    (is_session && !value.is_empty()).then(|| pair.to_string())
}

/// Cliente de un servicio concreto: elige dirección local o externa, autentica y hace peticiones.
pub struct ServiceClient {
    kind: ServiceKind,
    config: ServiceConfig,
    secrets: ServiceSecrets,
    http: reqwest::Client,
    resolved: Mutex<Option<Resolved>>,
    sid: Mutex<Option<String>>,
}

impl ServiceClient {
    pub fn new(kind: ServiceKind, config: ServiceConfig, secrets: ServiceSecrets) -> Self {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("Dasharr/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        ServiceClient { kind, config, secrets, http, resolved: Mutex::new(None), sid: Mutex::new(None) }
    }

    pub fn kind(&self) -> ServiceKind {
        self.kind
    }

    pub fn config(&self) -> &ServiceConfig {
        &self.config
    }

    /// Última ruta conocida, sin hacer peticiones.
    pub async fn route(&self) -> Option<Route> {
        self.resolved.lock().await.as_ref().map(|r| r.route)
    }

    /// Comprueba qué dirección responde. Cualquier respuesta HTTP (incluso 401/403) cuenta como alcanzable.
    pub async fn probe(&self) -> Route {
        let resolved = if let Some(base) = self.reachable(self.config.local(), LOCAL_PROBE_TIMEOUT).await {
            Resolved { route: Route::Local, base: Some(base) }
        } else if let Some(base) = self.reachable(self.config.external(), REMOTE_PROBE_TIMEOUT).await {
            Resolved { route: Route::Remote, base: Some(base) }
        } else {
            Resolved { route: Route::Offline, base: None }
        };
        let route = resolved.route;
        let previous = self.resolved.lock().await.replace(resolved).map(|r| r.route);
        if previous != Some(route) {
            match route {
                Route::Offline => log::warn!("{}: sin conexión (no responde ni la dirección local ni la externa)", self.kind.as_str()),
                _ => log::info!("{}: conectado por la dirección {}", self.kind.as_str(), if route == Route::Local { "local" } else { "externa" }),
            }
        }
        route
    }

    async fn reachable(&self, base: Option<&str>, timeout: Duration) -> Option<String> {
        let base = base?;
        let url = join_url(base, self.kind.probe_path()).ok()?;
        let req = self.with_proxy_auth(self.http.get(url)).timeout(timeout);
        req.send().await.ok().map(|_| base.to_string())
    }

    async fn base(&self, force_probe: bool) -> Result<String, ApiError> {
        if !self.config.is_configured() {
            return Err(ApiError::NotConfigured);
        }
        let cached = self.resolved.lock().await.clone();
        let resolved = match cached {
            Some(r) if !force_probe && r.base.is_some() => r,
            _ => {
                self.probe().await;
                self.resolved.lock().await.clone().expect("probe guarda el resultado")
            }
        };
        resolved.base.ok_or_else(|| ApiError::network("no responde ni la dirección local ni la externa"))
    }

    fn with_proxy_auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match (&self.secrets.proxy_username, &self.secrets.proxy_password) {
            (Some(u), p) if !u.is_empty() => req.basic_auth(u, p.as_deref()),
            _ => req,
        }
    }

    fn uses_qbit_login(&self) -> bool {
        self.kind == ServiceKind::Qbittorrent && self.secrets.username.as_deref().is_some_and(|u| !u.is_empty())
    }

    async fn qbit_login(&self, base: &str) -> Result<String, ApiError> {
        let url = join_url(base, "/api/v2/auth/login")?;
        let form = [
            ("username", self.secrets.username.clone().unwrap_or_default()),
            ("password", self.secrets.password.clone().unwrap_or_default()),
        ];
        let res = self
            .with_proxy_auth(self.http.post(url))
            .header(header::REFERER, base)
            .form(&form)
            .send()
            .await
            .map_err(ApiError::network)?;
        let sid = res
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .find_map(|c| session_cookie(c.split(';').next()?.trim()));
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::FORBIDDEN || status == StatusCode::UNAUTHORIZED || text.trim() == "Fails." {
            return Err(ApiError::Unauthorized);
        }
        if !status.is_success() {
            return Err(ApiError::Http { status: status.as_u16(), message: text });
        }
        // Sin cookie pero con "Ok.": qBittorrent no exige sesión (p. ej. red en lista blanca). Se guarda vacía.
        let sid = sid.unwrap_or_default();
        *self.sid.lock().await = Some(sid.clone());
        Ok(sid)
    }

    async fn send_once(&self, base: &str, req: &ApiRequest, sid: Option<&str>) -> Result<reqwest::Response, ApiError> {
        let url = join_url(base, &req.path)?;
        let method = Method::from_bytes(req.method.to_uppercase().as_bytes()).unwrap_or(Method::GET);
        let mut b = self.with_proxy_auth(self.http.request(method, url));
        if !req.query.is_empty() {
            b = b.query(&req.query);
        }
        b = match self.kind {
            ServiceKind::Radarr | ServiceKind::Sonarr | ServiceKind::Prowlarr => {
                b.header("X-Api-Key", self.secrets.api_key.clone().unwrap_or_default())
            }
            ServiceKind::Bazarr => b.header("X-API-KEY", self.secrets.api_key.clone().unwrap_or_default()),
            ServiceKind::Qbittorrent => {
                let b = b.header(header::REFERER, base);
                match sid {
                    Some(cookie) if !cookie.is_empty() => b.header(header::COOKIE, cookie),
                    _ => b,
                }
            }
        };
        b = match &req.body {
            None => b,
            Some(ApiBody::Json(v)) => b.json(v),
            Some(ApiBody::Form(f)) => b.form(f),
            Some(ApiBody::Multipart { fields, files }) => {
                let mut form = reqwest::multipart::Form::new();
                for (k, v) in fields {
                    form = form.text(k.clone(), v.clone());
                }
                for f in files {
                    let bytes = base64::engine::general_purpose::STANDARD.decode(&f.base64).unwrap_or_default();
                    form = form.part(f.field.clone(), reqwest::multipart::Part::bytes(bytes).file_name(f.filename.clone()));
                }
                b.multipart(form)
            }
        };
        b.send().await.map_err(ApiError::network)
    }

    /// Envía la petición con autenticación, reintentando una vez tras error de red (re-probe) o sesión caducada de qBittorrent.
    async fn send(&self, req: &ApiRequest) -> Result<reqwest::Response, ApiError> {
        let mut base = self.base(false).await?;
        let mut sid = None;
        if self.uses_qbit_login() {
            let cached = self.sid.lock().await.clone();
            sid = Some(match cached {
                Some(s) => s,
                None => self.qbit_login(&base).await?,
            });
        }
        let res = match self.send_once(&base, req, sid.as_deref()).await {
            Ok(r) => r,
            Err(_) => {
                base = self.base(true).await?;
                self.send_once(&base, req, sid.as_deref()).await?
            }
        };
        if res.status() == StatusCode::FORBIDDEN && self.uses_qbit_login() {
            let fresh = self.qbit_login(&base).await?;
            return self.send_once(&base, req, Some(&fresh)).await;
        }
        Ok(res)
    }

    fn check_status(status: StatusCode, headers: &header::HeaderMap, text: &str) -> Result<(), ApiError> {
        // Un 401 con "WWW-Authenticate: Basic" viene del proxy inverso, no del servicio.
        let basic = headers
            .get(header::WWW_AUTHENTICATE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.to_ascii_lowercase().starts_with("basic"));
        if status == StatusCode::UNAUTHORIZED && basic {
            return Err(ApiError::Http {
                status: 401,
                message: "el proxy inverso pide usuario y contraseña (rellena los campos del proxy en Ajustes)".into(),
            });
        }
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(ApiError::Unauthorized);
        }
        if status.is_client_error() || status.is_server_error() {
            let message: String = text.chars().take(500).collect();
            return Err(ApiError::Http { status: status.as_u16(), message });
        }
        Ok(())
    }

    pub async fn request(&self, req: ApiRequest) -> Result<ApiResponse, ApiError> {
        let started = Instant::now();
        let result = self.request_inner(&req).await;
        let ms = started.elapsed().as_millis();
        // Solo método y ruta: la consulta y el cuerpo pueden llevar datos sensibles.
        match &result {
            Ok(r) => log::debug!("{} {} {} -> {} ({ms} ms)", self.kind.as_str(), req.method.to_uppercase(), req.path, r.status),
            Err(e) => log::error!("{} {} {} -> {e} ({ms} ms)", self.kind.as_str(), req.method.to_uppercase(), req.path),
        }
        result
    }

    async fn request_inner(&self, req: &ApiRequest) -> Result<ApiResponse, ApiError> {
        let res = self.send(req).await?;
        let status = res.status();
        let headers = res.headers().clone();
        let text = res.text().await.map_err(ApiError::network)?;
        Self::check_status(status, &headers, &text)?;
        let body = if text.trim().is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(Value::String(text))
        };
        Ok(ApiResponse { status: status.as_u16(), body })
    }

    /// Descarga binaria (pósters). Devuelve bytes y tipo de contenido.
    pub async fn bytes(&self, path: &str) -> Result<(Vec<u8>, String), ApiError> {
        let res = self.send(&ApiRequest::get(path)).await?;
        let status = res.status();
        let ctype = res
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        if !status.is_success() {
            let headers = res.headers().clone();
            Self::check_status(status, &headers, "")?;
        }
        let bytes = res.bytes().await.map_err(ApiError::network)?;
        Ok((bytes.to_vec(), ctype))
    }

    /// Comprueba credenciales y devuelve la versión del servicio.
    pub async fn test(&self) -> Result<String, ApiError> {
        let (path, pointer) = match self.kind {
            ServiceKind::Radarr | ServiceKind::Sonarr => ("/api/v3/system/status", "/version"),
            ServiceKind::Prowlarr => ("/api/v1/system/status", "/version"),
            ServiceKind::Bazarr => ("/api/system/status", "/data/bazarr_version"),
            ServiceKind::Qbittorrent => ("/api/v2/app/version", ""),
        };
        let body = self.request(ApiRequest::get(path)).await?.body;
        let v = if pointer.is_empty() { Some(&body) } else { body.pointer(pointer) };
        Ok(v.and_then(Value::as_str).unwrap_or("?").to_string())
    }
}
