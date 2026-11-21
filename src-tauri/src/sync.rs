//! Copia de la configuración en Google Drive para tenerla igual en el PC y en el móvil.
//!
//! Se guarda un solo archivo con los servicios (direcciones), sus secretos (API keys, contraseñas, tokens),
//! la clave de TMDB y las preferencias de la interfaz. Va cifrado (AES-256-GCM) con una contraseña que el
//! usuario elige y escribe una vez en cada dispositivo: ni Google puede leer las claves.
//!
//! Sincronización: gana el último que guarda. Cada dispositivo recuerda qué versión de la copia trajo o subió
//! por última vez; si al subir encuentra otra más nueva, primero la trae.
use std::collections::{BTreeMap, BTreeSet};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use dasharr_core::ServiceKind;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

use crate::state::AppState;
use crate::{google, secrets, settings};

const STORE_FILE: &str = "sync.json";
const PASSWORD_SECRET: &str = "google-sync-key";
/// Secretos que viajan además de los de cada servicio.
const EXTRA_SECRETS: [&str; 1] = ["tmdb"];
const FORMAT: &str = "dasharr-sync";
const ITERATIONS: u32 = 310_000;
pub const WRONG_PASSWORD: &str = "La contraseña no es la de la copia guardada en Google.";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct Snapshot {
    #[serde(default)]
    services: serde_json::Map<String, Value>,
    #[serde(default)]
    secrets: BTreeMap<String, String>,
    #[serde(default)]
    prefs: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    format: String,
    version: u32,
    updated_at: i64,
    device: String,
    iterations: u32,
    salt: String,
    nonce: String,
    data: String,
}

#[derive(Default)]
pub struct ConfigSync {
    /// Última clave derivada (sal, clave): derivarla cuesta unas décimas y se sube a menudo.
    key: Mutex<Option<([u8; 16], [u8; 32])>>,
    /// Evita que una subida y una bajada se crucen.
    busy: Mutex<()>,
}

fn device() -> &'static str {
    if cfg!(target_os = "android") {
        "Android"
    } else if cfg!(windows) {
        "Windows"
    } else {
        "PC"
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn derive(password: &str, salt: &[u8; 16], iterations: u32) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut key);
    key
}

/// Derivar la clave tarda unas décimas: fuera de los hilos de la app.
async fn derive_async(password: &str, salt: [u8; 16], iterations: u32) -> [u8; 32] {
    let password = password.to_string();
    tokio::task::spawn_blocking(move || derive(&password, &salt, iterations)).await.expect("derivar clave")
}

/// JSON con las claves ordenadas, para que el mismo contenido dé siempre la misma huella.
fn canonical(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let sorted: BTreeMap<_, _> = m.iter().map(|(k, v)| (k.clone(), canonical(v))).collect();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(a) => Value::Array(a.iter().map(canonical).collect()),
        other => other.clone(),
    }
}

fn fingerprint(s: &Snapshot) -> String {
    let v = canonical(&serde_json::to_value(s).unwrap_or(Value::Null));
    hex(&Sha256::digest(v.to_string().as_bytes()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn encrypt(snapshot: &Snapshot, salt: [u8; 16], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
    let plain = serde_json::to_vec(snapshot).map_err(|e| e.to_string())?;
    let data = cipher.encrypt(Nonce::from_slice(&nonce), plain.as_ref()).map_err(|_| "No se pudo cifrar la copia.".to_string())?;
    let env = Envelope {
        format: FORMAT.into(),
        version: 1,
        updated_at: now_ms(),
        device: device().into(),
        iterations: ITERATIONS,
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        data: B64.encode(data),
    };
    serde_json::to_vec_pretty(&env).map_err(|e| e.to_string())
}

fn parse_envelope(bytes: &[u8]) -> Result<(Envelope, [u8; 16]), String> {
    let env: Envelope = serde_json::from_slice(bytes).map_err(|_| "La copia de Google no es de Dasharr o está dañada.".to_string())?;
    if env.format != FORMAT || env.version != 1 {
        return Err("La copia de Google es de una versión más nueva de Dasharr: actualiza esta.".into());
    }
    let salt: [u8; 16] = B64.decode(&env.salt).ok().and_then(|s| s.try_into().ok()).ok_or("Copia de Google dañada.")?;
    Ok((env, salt))
}

fn decrypt(env: &Envelope, key: &[u8; 32]) -> Result<Snapshot, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = B64.decode(&env.nonce).map_err(|_| "Copia de Google dañada.")?;
    let data = B64.decode(&env.data).map_err(|_| "Copia de Google dañada.")?;
    if nonce.len() != 12 {
        return Err("Copia de Google dañada.".into());
    }
    let plain = cipher.decrypt(Nonce::from_slice(&nonce), data.as_ref()).map_err(|_| WRONG_PASSWORD.to_string())?;
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}

/// Lo que se recuerda en este dispositivo sobre la copia.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Local {
    /// Versión (modifiedTime de Drive) que se trajo o subió por última vez.
    last_remote: Option<String>,
    /// Huella del contenido en ese momento: si no cambia, no hace falta subir nada.
    last_hash: Option<String>,
    last_sync: Option<i64>,
}

fn load_local<R: Runtime>(app: &AppHandle<R>) -> Local {
    app.store(STORE_FILE).ok().and_then(|s| s.get("state")).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

fn save_local<R: Runtime>(app: &AppHandle<R>, local: &Local) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set("state", serde_json::to_value(local).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

/// Secretos que forman parte de la configuración: los de cada servicio (también los que esta versión no
/// conoce pero están en la lista de servicios, para no perderlos) y los extra.
fn secret_names(services: &serde_json::Map<String, Value>) -> BTreeSet<String> {
    ServiceKind::ALL
        .iter()
        .map(|k| k.as_str().to_string())
        .chain(services.keys().cloned())
        .chain(EXTRA_SECRETS.iter().map(|s| s.to_string()))
        .collect()
}

fn build<R: Runtime>(app: &AppHandle<R>, prefs: Value) -> Snapshot {
    let services = settings::load_raw_services(app);
    let secrets = secret_names(&services).into_iter().filter_map(|n| secrets::get(&n).map(|v| (n, v))).collect();
    Snapshot { services, secrets, prefs }
}

async fn apply<R: Runtime>(app: &AppHandle<R>, state: &AppState, snapshot: &Snapshot) -> Result<(), String> {
    let mut names = secret_names(&settings::load_raw_services(app));
    names.extend(secret_names(&snapshot.services));
    names.extend(snapshot.secrets.keys().cloned());
    for name in names {
        match snapshot.secrets.get(&name) {
            Some(v) => secrets::set(&name, v)?,
            None => secrets::delete(&name)?,
        }
    }
    settings::save_raw_services(app, snapshot.services.clone())?;
    state.load(app).await;
    state.tmdb.forget_key().await;
    state.probe_all(app, true).await;
    Ok(())
}

impl ConfigSync {
    async fn key_for(&self, password: &str, salt: Option<([u8; 16], u32)>) -> ([u8; 16], [u8; 32]) {
        let mut cache = self.key.lock().await;
        match salt {
            Some((salt, iterations)) => {
                if let Some((s, k)) = cache.as_ref() {
                    if *s == salt && iterations == ITERATIONS {
                        return (*s, *k);
                    }
                }
                let key = derive_async(password, salt, iterations).await;
                if iterations == ITERATIONS {
                    *cache = Some((salt, key));
                }
                (salt, key)
            }
            None => {
                if let Some(c) = cache.as_ref() {
                    return *c;
                }
                let mut salt = [0u8; 16];
                getrandom::getrandom(&mut salt).expect("generador aleatorio del sistema");
                let key = derive_async(password, salt, ITERATIONS).await;
                *cache = Some((salt, key));
                (salt, key)
            }
        }
    }

    async fn open(&self, bytes: &[u8], password: &str) -> Result<Snapshot, String> {
        let (env, salt) = parse_envelope(bytes)?;
        let (_, key) = self.key_for(password, Some((salt, env.iterations))).await;
        decrypt(&env, &key)
    }
}

fn password() -> Result<String, String> {
    secrets::get(PASSWORD_SECRET).filter(|p| !p.is_empty()).ok_or_else(|| "Falta la contraseña de la copia.".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// La versión trae la conexión con Google (se compila con su identificador).
    available: bool,
    signed_in: bool,
    email: Option<String>,
    has_password: bool,
    /// Este dispositivo ya ha traído o subido la copia alguna vez.
    linked: bool,
    last_sync: Option<i64>,
}

#[tauri::command]
pub async fn google_status(app: AppHandle, state: State<'_, AppState>) -> Result<GoogleStatus, ()> {
    let local = load_local(&app);
    Ok(GoogleStatus {
        available: google::client().is_some(),
        signed_in: state.google.signed_in(),
        email: state.google.email().filter(|e| !e.is_empty()),
        has_password: password().is_ok(),
        linked: local.last_remote.is_some(),
        last_sync: local.last_sync,
    })
}

#[tauri::command]
pub async fn google_login(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let email = state.google.login(&app).await?;
    // Otra cuenta: lo recordado de la copia anterior ya no vale.
    save_local(&app, &Local::default())?;
    Ok(email)
}

#[tauri::command]
pub async fn google_login_cancel(state: State<'_, AppState>) -> Result<(), ()> {
    state.google.cancel_login().await;
    Ok(())
}

/// Cierra la sesión en este dispositivo. La copia en Google se queda (la usan los demás dispositivos).
#[tauri::command]
pub async fn google_logout(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.google.logout().await?;
    secrets::delete(PASSWORD_SECRET)?;
    *state.sync.key.lock().await = None;
    save_local(&app, &Local::default())
}

/// Guarda la contraseña de la copia. Si ya hay una copia en Google, tiene que ser la suya.
#[tauri::command]
pub async fn sync_set_password(state: State<'_, AppState>, password: String) -> Result<(), String> {
    if password.chars().count() < 8 {
        return Err("La contraseña tiene que tener al menos 8 caracteres.".into());
    }
    let _busy = state.sync.busy.lock().await;
    *state.sync.key.lock().await = None;
    if let Some(remote) = state.google.find().await? {
        let bytes = state.google.download(&remote.id).await?;
        state.sync.open(&bytes, &password).await?;
    }
    secrets::set(PASSWORD_SECRET, &password)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum PushResult {
    /// Nada ha cambiado desde la última vez.
    Unchanged,
    Uploaded,
    /// Hay una copia más nueva que la de este dispositivo: hay que traerla (o forzar la subida).
    RemoteNewer { updated_at: Option<i64>, device: Option<String> },
}

/// Sube la configuración de este dispositivo. `prefs` son las preferencias de la interfaz que viajan.
#[tauri::command]
pub async fn sync_push(app: AppHandle, state: State<'_, AppState>, prefs: Value, force: bool) -> Result<PushResult, String> {
    let password = password()?;
    let _busy = state.sync.busy.lock().await;
    let snapshot = build(&app, prefs);
    let hash = fingerprint(&snapshot);
    let mut local = load_local(&app);
    if !force && local.last_hash.as_deref() == Some(hash.as_str()) && local.last_remote.is_some() {
        return Ok(PushResult::Unchanged);
    }
    let remote = state.google.find().await?;
    if let Some(r) = &remote {
        if !force && local.last_remote.as_deref() != Some(r.modified_time.as_str()) {
            let env = state.google.download(&r.id).await.ok().and_then(|b| parse_envelope(&b).ok()).map(|(e, _)| e);
            return Ok(PushResult::RemoteNewer { updated_at: env.as_ref().map(|e| e.updated_at), device: env.map(|e| e.device) });
        }
    }
    let (salt, key) = state.sync.key_for(&password, None).await;
    let body = encrypt(&snapshot, salt, &key)?;
    let file = state.google.upload(remote.as_ref().map(|r| r.id.as_str()), body).await?;
    local = Local { last_remote: Some(file.modified_time), last_hash: Some(hash), last_sync: Some(now_ms()) };
    save_local(&app, &local)?;
    log::info!("Google: configuración subida");
    Ok(PushResult::Uploaded)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum PullResult {
    /// No hay copia en Google.
    Empty,
    Unchanged,
    /// Se ha aplicado la copia; la interfaz aplica `prefs`.
    Applied { prefs: Value, updated_at: i64, device: String },
}

/// Trae la copia de Google y la aplica en este dispositivo (sustituye la configuración de aquí).
#[tauri::command]
pub async fn sync_pull(app: AppHandle, state: State<'_, AppState>, force: bool) -> Result<PullResult, String> {
    let password = password()?;
    let _busy = state.sync.busy.lock().await;
    let Some(remote) = state.google.find().await? else { return Ok(PullResult::Empty) };
    let mut local = load_local(&app);
    if !force && local.last_remote.as_deref() == Some(remote.modified_time.as_str()) {
        return Ok(PullResult::Unchanged);
    }
    let bytes = state.google.download(&remote.id).await?;
    let (env, _) = parse_envelope(&bytes)?;
    let snapshot = state.sync.open(&bytes, &password).await?;
    apply(&app, &state, &snapshot).await?;
    local = Local { last_remote: Some(remote.modified_time), last_hash: Some(fingerprint(&snapshot)), last_sync: Some(now_ms()) };
    save_local(&app, &local)?;
    log::info!("Google: configuración traída (de {})", env.device);
    Ok(PullResult::Applied { prefs: snapshot.prefs, updated_at: env.updated_at, device: env.device })
}

/// Borra la copia de Google (por ejemplo, si se ha olvidado la contraseña) y la contraseña de este dispositivo,
/// para elegir otra. La configuración de este dispositivo no se toca.
#[tauri::command]
pub async fn sync_delete_remote(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let _busy = state.sync.busy.lock().await;
    if let Some(remote) = state.google.find().await? {
        state.google.delete(&remote.id).await?;
    }
    secrets::delete(PASSWORD_SECRET)?;
    *state.sync.key.lock().await = None;
    save_local(&app, &Local::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Snapshot {
        let mut services = serde_json::Map::new();
        services.insert("radarr".into(), serde_json::json!({ "localUrl": "http://nas:7878", "enabled": true }));
        Snapshot {
            services,
            secrets: BTreeMap::from([("radarr".into(), r#"{"apiKey":"abc"}"#.into())]),
            prefs: serde_json::json!({ "theme": "light", "a": [1, 2] }),
        }
    }

    #[test]
    fn round_trip_and_wrong_password() {
        let salt = [7u8; 16];
        let key = derive("contraseña larga", &salt, 1000);
        let bytes = encrypt(&sample(), salt, &key).unwrap();
        let text = String::from_utf8(bytes.clone()).unwrap();
        assert!(!text.contains("abc") && !text.contains("nas:7878"), "la copia no debe llevar nada en claro");
        let (env, got_salt) = parse_envelope(&bytes).unwrap();
        assert_eq!(got_salt, salt);
        assert_eq!(decrypt(&env, &key).unwrap(), sample());
        let other = derive("otra contraseña", &salt, 1000);
        assert_eq!(decrypt(&env, &other).unwrap_err(), WRONG_PASSWORD);
    }

    #[test]
    fn fingerprint_ignores_key_order() {
        let a = sample();
        let mut b = sample();
        b.prefs = serde_json::from_str(r#"{ "a": [1, 2], "theme": "light" }"#).unwrap();
        assert_eq!(fingerprint(&a), fingerprint(&b));
        b.prefs["theme"] = "dark".into();
        assert_ne!(fingerprint(&a), fingerprint(&b));
    }

    #[test]
    fn unknown_services_keep_their_secrets() {
        let mut services = serde_json::Map::new();
        services.insert("futuro".into(), Value::Null);
        let names = secret_names(&services);
        assert!(names.contains("futuro") && names.contains("radarr") && names.contains("tmdb"));
        assert!(!names.contains("google") && !names.contains(PASSWORD_SECRET));
    }
}
