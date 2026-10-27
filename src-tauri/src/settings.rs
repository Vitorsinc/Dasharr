//! Configuración de servicios: URLs en el store (JSON en AppData) y secretos en el Administrador de credenciales.
use std::collections::HashMap;

use dasharr_core::{ServiceConfig, ServiceKind, ServiceSecrets};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
const SERVICES_KEY: &str = "services";
const KEYRING_SERVICE: &str = "dasharr";

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
        apply(&mut s.api_key, &self.api_key);
        apply(&mut s.username, &self.username);
        apply(&mut s.password, &self.password);
        apply(&mut s.proxy_username, &self.proxy_username);
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

pub fn load_configs<R: Runtime>(app: &AppHandle<R>) -> HashMap<ServiceKind, ServiceConfig> {
    let Ok(store) = app.store(STORE_FILE) else { return HashMap::new() };
    store
        .get(SERVICES_KEY)
        .and_then(|v| serde_json::from_value::<HashMap<ServiceKind, ServiceConfig>>(v).ok())
        .unwrap_or_default()
}

pub fn save_config<R: Runtime>(app: &AppHandle<R>, kind: ServiceKind, config: &ServiceConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut all = load_configs(app);
    all.insert(kind, config.clone());
    store.set(SERVICES_KEY, serde_json::to_value(all).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

fn entry(kind: ServiceKind) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, kind.as_str()).map_err(|e| e.to_string())
}

pub fn load_secrets(kind: ServiceKind) -> ServiceSecrets {
    entry(kind)
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_secrets(kind: ServiceKind, secrets: &ServiceSecrets) -> Result<(), String> {
    let json = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
    entry(kind)?.set_password(&json).map_err(|e| format!("No se pudo guardar en el Administrador de credenciales: {e}"))
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
        assert_eq!(merged.password, None);
        assert_eq!(merged.username.as_deref(), Some("admin"));
    }
}
