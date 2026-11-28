//! Copia de la configuración en Google Drive para tenerla igual en el PC y en el móvil.
//!
//! Se guarda un solo archivo con los servicios (direcciones), sus secretos (API keys, contraseñas, tokens),
//! la clave de TMDB y las preferencias de la interfaz. Está en la carpeta privada de la app en Drive
//! (`appDataFolder`): no aparece en Drive y solo Dasharr, con el permiso de esa cuenta, puede leerla.
//!
//! Sincronización: gana el último que guarda. Cada dispositivo recuerda qué versión de la copia trajo o subió
//! por última vez; si al subir encuentra otra más nueva, primero la trae.
use std::collections::{BTreeMap, BTreeSet};

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
/// Contraseña de la copia de las primeras versiones (cifrada): ya no se usa, se borra al cerrar sesión.
const LEGACY_PASSWORD_SECRET: &str = "google-sync-key";
/// Secretos que viajan además de los de cada servicio.
const EXTRA_SECRETS: [&str; 1] = ["tmdb"];
const FORMAT: &str = "dasharr-sync";
const VERSION: u32 = 2;

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
    data: Snapshot,
}

/// Solo los datos de la cabecera, para reconocer las copias de otras versiones.
#[derive(Deserialize)]
struct Header {
    format: String,
    version: u32,
}

#[derive(Default)]
pub struct ConfigSync {
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

/// Hay algo que merezca la pena guardar: al menos un servicio con dirección. Una instalación recién hecha
/// no tiene nada y nunca debe tapar la configuración que otro dispositivo ya guardó en la cuenta.
fn has_config(s: &Snapshot) -> bool {
    s.services.values().any(|v| {
        ["localUrl", "externalUrl"].iter().any(|k| v.get(k).and_then(Value::as_str).is_some_and(|u| !u.trim().is_empty()))
    })
}

fn fingerprint(s: &Snapshot) -> String {
    let v = canonical(&serde_json::to_value(s).unwrap_or(Value::Null));
    hex(&Sha256::digest(v.to_string().as_bytes()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn pack(snapshot: Snapshot) -> Result<Vec<u8>, String> {
    let env = Envelope { format: FORMAT.into(), version: VERSION, updated_at: now_ms(), device: device().into(), data: snapshot };
    serde_json::to_vec(&env).map_err(|e| e.to_string())
}

/// `None`: la copia es de las primeras versiones (cifrada con contraseña) y no se puede leer; se sustituye.
fn unpack(bytes: &[u8]) -> Result<Option<Envelope>, String> {
    let header: Header = serde_json::from_slice(bytes).map_err(|_| "La copia de Google no es de Dasharr o está dañada.".to_string())?;
    if header.format != FORMAT {
        return Err("La copia de Google no es de Dasharr.".into());
    }
    match header.version {
        1 => Ok(None),
        VERSION => serde_json::from_slice(bytes).map(Some).map_err(|_| "La copia de Google está dañada.".to_string()),
        _ => Err("La copia de Google es de una versión más nueva de Dasharr: actualiza esta.".into()),
    }
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
    /// Ya sincronizado con la copia sin contraseña. Los que venían de las primeras versiones suben lo suyo
    /// la primera vez en vez de traer lo que hubiera (otro dispositivo pudo sustituir la copia vieja).
    #[serde(default)]
    v2: bool,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// La versión trae la conexión con Google (se compila con su identificador).
    available: bool,
    signed_in: bool,
    email: Option<String>,
    /// Este dispositivo ya ha traído o subido la copia alguna vez.
    linked: bool,
    last_sync: Option<i64>,
}

#[tauri::command]
pub async fn google_status(app: AppHandle, state: State<'_, AppState>) -> Result<GoogleStatus, ()> {
    let local = load_local(&app);
    Ok(GoogleStatus {
        available: google::available(),
        signed_in: state.google.signed_in(),
        email: state.google.email().filter(|e| !e.is_empty()),
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
pub async fn google_login_paste(state: State<'_, AppState>, url: String) -> Result<(), String> {
    state.google.paste_login(&url).await
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
    secrets::delete(LEGACY_PASSWORD_SECRET)?;
    save_local(&app, &Local::default())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum PushResult {
    /// Nada ha cambiado desde la última vez.
    Unchanged,
    Uploaded,
    /// En este dispositivo no hay nada configurado todavía: no se sube (no taparía la de la cuenta).
    NothingToUpload,
    /// Hay una copia más nueva que la de este dispositivo: hay que traerla (o forzar la subida).
    RemoteNewer { updated_at: Option<i64>, device: Option<String> },
}

/// Sube la configuración de este dispositivo. `prefs` son las preferencias de la interfaz que viajan.
#[tauri::command]
pub async fn sync_push(app: AppHandle, state: State<'_, AppState>, prefs: Value, force: bool) -> Result<PushResult, String> {
    let _busy = state.sync.busy.lock().await;
    let snapshot = build(&app, prefs);
    let mut local = load_local(&app);
    // Sin nada configurado aquí no se sube: se queda esperando a la configuración de la cuenta.
    if !has_config(&snapshot) {
        if local.last_remote.is_none() {
            local = Local { last_remote: Some(String::new()), v2: true, ..Default::default() };
            save_local(&app, &local)?;
        }
        return Ok(PushResult::NothingToUpload);
    }
    let force = force || (local.last_remote.is_some() && !local.v2);
    let hash = fingerprint(&snapshot);
    if !force && local.last_hash.as_deref() == Some(hash.as_str()) && local.last_remote.is_some() {
        return Ok(PushResult::Unchanged);
    }
    let remote = state.google.find().await?;
    if let Some(r) = &remote {
        if !force && local.last_remote.as_deref() != Some(r.modified_time.as_str()) {
            // Una copia de las primeras versiones (con contraseña) o una vacía se sustituye.
            if let Some(env) = unpack(&state.google.download(&r.id).await?)?.filter(|e| has_config(&e.data)) {
                return Ok(PushResult::RemoteNewer { updated_at: Some(env.updated_at), device: Some(env.device) });
            }
        }
    }
    let body = pack(snapshot)?;
    let file = state.google.upload(remote.as_ref().map(|r| r.id.as_str()), body).await?;
    local = Local { last_remote: Some(file.modified_time), last_hash: Some(hash), last_sync: Some(now_ms()), v2: true };
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
    let _busy = state.sync.busy.lock().await;
    let mut local = load_local(&app);
    let here = build(&app, Value::Null);
    // Venía de las primeras versiones: primero sube lo suyo (ver `Local::v2`).
    if !force && local.last_remote.is_some() && !local.v2 && has_config(&here) {
        return Ok(PullResult::Unchanged);
    }
    let Some(remote) = state.google.find().await? else { return Ok(PullResult::Empty) };
    if !force && local.last_remote.as_deref() == Some(remote.modified_time.as_str()) {
        return Ok(PullResult::Unchanged);
    }
    let Some(env) = unpack(&state.google.download(&remote.id).await?)? else { return Ok(PullResult::Empty) };
    // Una copia sin nada configurado no sustituye lo de aquí (la subió una instalación recién hecha).
    if !has_config(&env.data) && has_config(&here) {
        return Ok(PullResult::Empty);
    }
    let snapshot = env.data;
    apply(&app, &state, &snapshot).await?;
    local = Local { last_remote: Some(remote.modified_time), last_hash: Some(fingerprint(&snapshot)), last_sync: Some(now_ms()), v2: true };
    save_local(&app, &local)?;
    log::info!("Google: configuración traída (de {})", env.device);
    Ok(PullResult::Applied { prefs: snapshot.prefs, updated_at: env.updated_at, device: env.device })
}

/// Borra la copia de Google. La configuración de este dispositivo no se toca.
#[tauri::command]
pub async fn sync_delete_remote(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let _busy = state.sync.busy.lock().await;
    if let Some(remote) = state.google.find().await? {
        state.google.delete(&remote.id).await?;
    }
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
    fn pack_round_trip_and_old_copies() {
        let env = unpack(&pack(sample()).unwrap()).unwrap().unwrap();
        assert_eq!(env.data, sample());
        let old = br#"{"format":"dasharr-sync","version":1,"updatedAt":1,"device":"Windows","iterations":1,"salt":"","nonce":"","data":""}"#;
        assert!(unpack(old).unwrap().is_none());
        assert!(unpack(br#"{"format":"dasharr-sync","version":9}"#).is_err());
        assert!(unpack(b"hola").is_err());
    }

    #[test]
    fn empty_install_has_no_config() {
        assert!(has_config(&sample()));
        let mut empty = sample();
        empty.services = serde_json::Map::new();
        assert!(!has_config(&empty));
        empty.services.insert("radarr".into(), serde_json::json!({ "localUrl": " ", "enabled": true }));
        assert!(!has_config(&empty));
        empty.services.insert("sonarr".into(), serde_json::json!({ "externalUrl": "https://s.example" }));
        assert!(has_config(&empty));
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
        assert!(!names.contains("google") && !names.contains(LEGACY_PASSWORD_SECRET));
    }
}
