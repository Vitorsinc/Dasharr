//! Cuenta de Google: inicio de sesión (OAuth para apps instaladas, con redirección a 127.0.0.1 y PKCE, igual
//! en Windows y en Android) y un único archivo en la carpeta oculta de la app en Google Drive
//! (`appDataFolder`), que solo esta app puede ver. El token de refresco se guarda con los demás secretos.
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};

use crate::secrets;

/// Se rellenan al compilar con los secretos del repositorio (ver docs/google.md). Sin ellos no hay inicio de sesión.
const CLIENT_ID: Option<&str> = option_env!("DASHARR_GOOGLE_CLIENT_ID");
/// En las apps instaladas Google no lo trata como secreto (cualquiera puede sacarlo del programa), pero lo pide.
const CLIENT_SECRET: Option<&str> = option_env!("DASHARR_GOOGLE_CLIENT_SECRET");

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const DRIVE_FILES: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
/// Solo la carpeta privada de la app en Drive (no ve el resto de archivos) y la dirección de correo.
const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.appdata";
const SECRET_NAME: &str = "google";
const FILE_NAME: &str = "dasharr-config.json";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

pub fn client() -> Option<(&'static str, &'static str)> {
    Some((CLIENT_ID.filter(|s| !s.is_empty())?, CLIENT_SECRET.unwrap_or("")))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    refresh_token: String,
    email: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
}

/// Archivo de la copia en Drive.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub id: String,
    pub modified_time: String,
}

#[derive(Default)]
pub struct Google {
    http: std::sync::OnceLock<reqwest::Client>,
    access: Mutex<Option<(String, Instant)>>,
    cancel: Mutex<Option<oneshot::Sender<()>>>,
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("generador aleatorio del sistema");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// La dirección de correo va en el `id_token`; viene directamente de Google por HTTPS, así que basta con leerlo.
fn email_from_id_token(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("email")?.as_str().map(str::to_string)
}

fn load_account() -> Option<Account> {
    secrets::get(SECRET_NAME).and_then(|s| serde_json::from_str(&s).ok())
}

/// Saca `code` y `state` de la primera línea de la petición del navegador ("GET /?code=…&state=… HTTP/1.1").
fn parse_callback(request: &str) -> Option<Result<(String, String), String>> {
    let target = request.lines().next()?.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let get = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());
    if let Some(err) = get("error") {
        return Some(Err(err));
    }
    Some(Ok((get("code")?, get("state")?)))
}

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Dasharr</title>\
<body style='font-family:system-ui;background:#0f1115;color:#e6e6e6;display:grid;place-items:center;height:90vh;text-align:center'>\
<div><h2>Listo</h2><p>Ya has iniciado sesión con Google. Puedes cerrar esta pestaña y volver a Dasharr.</p></div>";
const PAGE_ERR: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Dasharr</title>\
<body style='font-family:system-ui;background:#0f1115;color:#e6e6e6;display:grid;place-items:center;height:90vh;text-align:center'>\
<div><h2>No se ha podido iniciar sesión</h2><p>Vuelve a Dasharr e inténtalo de nuevo.</p></div>";

async fn respond(stream: &mut tokio::net::TcpStream, body: &str) {
    let res = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(res.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// Espera la vuelta del navegador con el código. Otras peticiones (el icono de la pestaña) se ignoran.
async fn wait_for_code(listener: TcpListener, state: &str) -> Result<String, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let n = match tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buf)).await {
            Ok(Ok(n)) => n,
            _ => continue,
        };
        let request = String::from_utf8_lossy(&buf[..n]).to_string();
        match parse_callback(&request) {
            Some(Ok((code, got_state))) if got_state == state => {
                respond(&mut stream, PAGE_OK).await;
                return Ok(code);
            }
            Some(Err(err)) => {
                respond(&mut stream, PAGE_ERR).await;
                return Err(if err == "access_denied" { "Has cancelado el inicio de sesión.".into() } else { format!("Google ha respondido: {err}") });
            }
            _ => respond(&mut stream, PAGE_ERR).await,
        }
    }
}

impl Google {
    fn http(&self) -> reqwest::Client {
        self.http
            .get_or_init(|| reqwest::Client::builder().timeout(Duration::from_secs(30)).build().expect("cliente HTTP"))
            .clone()
    }

    pub fn email(&self) -> Option<String> {
        load_account().map(|a| a.email.unwrap_or_default())
    }

    pub fn signed_in(&self) -> bool {
        load_account().is_some()
    }

    /// Abre el navegador con la página de Google y espera a que el usuario acepte. Devuelve el correo.
    pub async fn login<R: Runtime>(&self, app: &AppHandle<R>) -> Result<String, String> {
        use tauri_plugin_opener::OpenerExt;
        let (client_id, client_secret) = client().ok_or("Esta versión de Dasharr no trae la conexión con Google.")?;
        let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
        let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
        let verifier = random_token();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let state = random_token();
        let mut url = url::Url::parse(AUTH_URL).expect("URL fija");
        url.query_pairs_mut()
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", &redirect)
            .append_pair("response_type", "code")
            .append_pair("scope", SCOPES)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("access_type", "offline")
            // Sin esto Google no vuelve a dar token de refresco si ya se había aceptado antes.
            .append_pair("prompt", "consent");
        let (tx, rx) = oneshot::channel();
        if let Some(old) = self.cancel.lock().await.replace(tx) {
            let _ = old.send(());
        }
        app.opener().open_url(url.as_str(), None::<&str>).map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
        log::info!("Google: esperando el inicio de sesión en el navegador");
        let code = tokio::select! {
            r = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(listener, &state)) => match r {
                Ok(r) => r?,
                Err(_) => return Err("Se ha agotado el tiempo para iniciar sesión.".into()),
            },
            _ = rx => return Err("Inicio de sesión cancelado.".into()),
        };
        self.cancel.lock().await.take();
        let res = self
            .http()
            .post(TOKEN_URL)
            .form(&[
                ("code", code.as_str()),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("redirect_uri", redirect.as_str()),
                ("grant_type", "authorization_code"),
                ("code_verifier", verifier.as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            log::error!("Google: canje del código -> {status}");
            return Err(format!("Google no ha aceptado el inicio de sesión ({status}). {}", body.chars().take(200).collect::<String>()));
        }
        let token: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
        let refresh_token = token.refresh_token.ok_or("Google no ha devuelto permiso permanente; vuelve a intentarlo.")?;
        let email = token.id_token.as_deref().and_then(email_from_id_token);
        let account = Account { refresh_token, email: email.clone() };
        secrets::set(SECRET_NAME, &serde_json::to_string(&account).map_err(|e| e.to_string())?)?;
        let ttl = Duration::from_secs(token.expires_in.unwrap_or(3600).saturating_sub(60));
        *self.access.lock().await = Some((token.access_token, Instant::now() + ttl));
        log::info!("Google: sesión iniciada");
        Ok(email.unwrap_or_default())
    }

    pub async fn cancel_login(&self) {
        if let Some(tx) = self.cancel.lock().await.take() {
            let _ = tx.send(());
        }
    }

    /// Cierra la sesión: avisa a Google para que retire el permiso y borra el token de este dispositivo.
    pub async fn logout(&self) -> Result<(), String> {
        if let Some(account) = load_account() {
            let _ = self.http().post(REVOKE_URL).form(&[("token", account.refresh_token.as_str())]).send().await;
        }
        *self.access.lock().await = None;
        secrets::delete(SECRET_NAME)
    }

    async fn access_token(&self) -> Result<String, String> {
        let mut access = self.access.lock().await;
        if let Some((token, until)) = access.as_ref() {
            if Instant::now() < *until {
                return Ok(token.clone());
            }
        }
        let account = load_account().ok_or("No has iniciado sesión con Google.")?;
        let (client_id, client_secret) = client().ok_or("Esta versión de Dasharr no trae la conexión con Google.")?;
        let res = self
            .http()
            .post(TOKEN_URL)
            .form(&[
                ("refresh_token", account.refresh_token.as_str()),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let err = res.json::<TokenError>().await.map(|e| e.error).unwrap_or_default();
            log::error!("Google: renovar acceso -> {status} {err}");
            if err == "invalid_grant" {
                return Err("Google ha retirado el permiso. Vuelve a iniciar sesión.".into());
            }
            return Err(format!("Google no responde ({status})."));
        }
        let token: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
        let ttl = Duration::from_secs(token.expires_in.unwrap_or(3600).saturating_sub(60));
        *access = Some((token.access_token.clone(), Instant::now() + ttl));
        Ok(token.access_token)
    }

    async fn check(res: reqwest::Response, what: &str) -> Result<reqwest::Response, String> {
        if res.status().is_success() {
            return Ok(res);
        }
        let status = res.status();
        log::error!("Google Drive: {what} -> {status}");
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err("Google Drive no deja usar la copia: revisa que la API de Drive esté activada.".into());
        }
        Err(format!("Google Drive: no se pudo {what} ({status})."))
    }

    /// La copia guardada, si existe.
    pub async fn find(&self) -> Result<Option<RemoteFile>, String> {
        #[derive(Deserialize)]
        struct List {
            files: Vec<RemoteFile>,
        }
        let token = self.access_token().await?;
        let res = self
            .http()
            .get(DRIVE_FILES)
            .bearer_auth(token)
            .query(&[
                ("spaces", "appDataFolder"),
                ("q", &format!("name = '{FILE_NAME}' and trashed = false")),
                ("fields", "files(id,modifiedTime)"),
                ("orderBy", "modifiedTime desc"),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let list: List = Self::check(res, "buscar la copia").await?.json().await.map_err(|e| e.to_string())?;
        Ok(list.files.into_iter().next())
    }

    pub async fn download(&self, id: &str) -> Result<Vec<u8>, String> {
        let token = self.access_token().await?;
        let res = self
            .http()
            .get(format!("{DRIVE_FILES}/{id}"))
            .bearer_auth(token)
            .query(&[("alt", "media")])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(Self::check(res, "descargar la copia").await?.bytes().await.map_err(|e| e.to_string())?.to_vec())
    }

    /// Sube la copia (sustituye la que hubiera) y devuelve el archivo resultante.
    pub async fn upload(&self, existing: Option<&str>, content: Vec<u8>) -> Result<RemoteFile, String> {
        let token = self.access_token().await?;
        let fields = [("fields", "id,modifiedTime")];
        let req = match existing {
            Some(id) => self
                .http()
                .patch(format!("{DRIVE_UPLOAD}/{id}"))
                .query(&[("uploadType", "media")])
                .query(&fields)
                .header("Content-Type", "application/json")
                .body(content),
            None => {
                let boundary = format!("dasharr{}", random_token().replace(['-', '_'], ""));
                let meta = serde_json::json!({ "name": FILE_NAME, "parents": ["appDataFolder"] });
                let mut body = format!(
                    "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n"
                )
                .into_bytes();
                body.extend_from_slice(&content);
                body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
                self.http()
                    .post(DRIVE_UPLOAD)
                    .query(&[("uploadType", "multipart")])
                    .query(&fields)
                    .header("Content-Type", format!("multipart/related; boundary={boundary}"))
                    .body(body)
            }
        };
        let res = req.bearer_auth(token).send().await.map_err(|e| e.to_string())?;
        Self::check(res, "subir la copia").await?.json().await.map_err(|e| e.to_string())
    }

    pub async fn delete(&self, id: &str) -> Result<(), String> {
        let token = self.access_token().await?;
        let res = self.http().delete(format!("{DRIVE_FILES}/{id}")).bearer_auth(token).send().await.map_err(|e| e.to_string())?;
        Self::check(res, "borrar la copia").await.map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_code_and_state_from_redirect() {
        let req = "GET /?state=abc&code=4%2F0Ab_x&scope=email HTTP/1.1\r\nHost: 127.0.0.1:5000\r\n\r\n";
        assert_eq!(parse_callback(req), Some(Ok(("4/0Ab_x".into(), "abc".into()))));
        assert_eq!(parse_callback("GET /?error=access_denied&state=abc HTTP/1.1\r\n"), Some(Err("access_denied".into())));
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1\r\n"), None);
    }

    #[test]
    fn email_comes_from_id_token() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"a@b.com","sub":"1"}"#);
        assert_eq!(email_from_id_token(&format!("h.{payload}.s")).as_deref(), Some("a@b.com"));
    }
}
