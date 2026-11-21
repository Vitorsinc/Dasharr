//! Configuración de servicios: URLs en el store (JSON en AppData) y secretos aparte (ver `secrets`).
use std::collections::HashMap;

use dasharr_core::{ServiceConfig, ServiceKind, ServiceSecrets};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::secrets;

const STORE_FILE: &str = "settings.json";
const SERVICES_KEY: &str = "services";

/// Cambios en secretos: `None` mantiene el valor guardado, `Some("")` lo borra, `Some(v)` lo sustituye.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsPatch {
    pub api_key: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub proxy_username: Option<String>,
    pub proxy_password: Option<String>,
}

fn apply(field: &mut Option<String>, patch: &Option<String>) {
    match patch {
        None => {}
        Some(v) if v.is_empty() => *field = None,
        Some(v) => *field = Some(v.clone()),
    }
}

impl SecretsPatch {
    pub fn merge(&self, existing: &ServiceSecrets) -> ServiceSecrets {
        let mut s = existing.clone();
        // Las claves copiadas de la web suelen arrastrar espacios o saltos de línea.
        apply(&mut s.api_key, &self.api_key.as_ref().map(|v| v.trim().to_string()));
        apply(&mut s.username, &self.username.as_ref().map(|v| v.trim().to_string()));
        apply(&mut s.password, &self.password);
        apply(&mut s.proxy_username, &self.proxy_username.as_ref().map(|v| v.trim().to_string()));
        apply(&mut s.proxy_password, &self.proxy_password);
        s
    }
}

/// Lo que la interfaz ve de un servicio: nunca los valores secretos.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceSettingsView {
    pub config: ServiceConfig,
    pub has_api_key: bool,
    pub username: Option<String>,
    pub has_password: bool,
    pub proxy_username: Option<String>,
    pub has_proxy_password: bool,
}

impl ServiceSettingsView {
    pub fn new(config: ServiceConfig, s: &ServiceSecrets) -> Self {
        let present = |v: &Option<String>| v.as_deref().is_some_and(|x| !x.is_empty());
        ServiceSettingsView {
            config,
            has_api_key: present(&s.api_key),
            username: s.username.clone(),
            has_password: present(&s.password),
            proxy_username: s.proxy_username.clone(),
            has_proxy_password: present(&s.proxy_password),
        }
    }
}

/// Lee el mapa de servicios tal cual está en disco, sin interpretarlo.
fn raw_services(value: Option<serde_json::Value>) -> serde_json::Map<String, serde_json::Value> {
    match value {
        Some(serde_json::Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    }
}

pub fn load_configs<R: Runtime>(app: &AppHandle<R>) -> HashMap<ServiceKind, ServiceConfig> {
    let Ok(store) = app.store(STORE_FILE) else { return HashMap::new() };
    dasharr_core::parse_service_configs(&raw_services(store.get(SERVICES_KEY)))
}

pub fn save_config<R: Runtime>(app: &AppHandle<R>, kind: ServiceKind, config: &ServiceConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    // Se parte del contenido en bruto para no borrar servicios que esta versión no entiende.
    let mut all = raw_services(store.get(SERVICES_KEY));
    all.insert(kind.as_str().to_string(), serde_json::to_value(config).map_err(|e| e.to_string())?);
    store.set(SERVICES_KEY, serde_json::Value::Object(all));
    store.save().map_err(|e| e.to_string())
}

/// Lista de servicios tal cual está guardada (también los que esta versión no conoce), para la copia en Google.
pub fn load_raw_services<R: Runtime>(app: &AppHandle<R>) -> serde_json::Map<String, serde_json::Value> {
    app.store(STORE_FILE).ok().map(|s| raw_services(s.get(SERVICES_KEY))).unwrap_or_default()
}

pub fn save_raw_services<R: Runtime>(app: &AppHandle<R>, all: serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(SERVICES_KEY, serde_json::Value::Object(all));
    store.save().map_err(|e| e.to_string())
}

pub fn load_secrets(kind: ServiceKind) -> ServiceSecrets {
    secrets::get(kind.as_str()).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save_secrets(kind: ServiceKind, secrets: &ServiceSecrets) -> Result<(), String> {
    let json = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
    secrets::set(kind.as_str(), &json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_keeps_clears_and_sets() {
        let existing = ServiceSecrets { api_key: Some("old".into()), password: Some("p".into()), ..Default::default() };
        let patch = SecretsPatch { api_key: None, password: Some("".into()), username: Some("admin".into()), ..Default::default() };
        let merged = patch.merge(&existing);
        assert_eq!(merged.api_key.as_deref(), Some("old"));
        let trimmed = SecretsPatch { api_key: Some("  abc123\n".into()), ..Default::default() }.merge(&existing);
        assert_eq!(trimmed.api_key.as_deref(), Some("abc123"));
        assert_eq!(merged.password, None);
        assert_eq!(merged.username.as_deref(), Some("admin"));
    }
}
