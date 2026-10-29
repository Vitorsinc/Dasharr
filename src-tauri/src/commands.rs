use std::collections::HashMap;

use dasharr_core::{ApiError, ApiRequest, FetchedTorrent, Route, ServiceClient, ServiceConfig, ServiceKind};
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::settings::{self, SecretsPatch, ServiceSettingsView};
use crate::state::AppState;

fn kind(service: &str) -> Result<ServiceKind, ApiError> {
    ServiceKind::parse(service).ok_or(ApiError::NotConfigured)
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> HashMap<ServiceKind, ServiceSettingsView> {
    let configs = settings::load_configs(&app);
    ServiceKind::ALL
        .into_iter()
        .map(|k| {
            let config = configs.get(&k).cloned().unwrap_or_default();
            (k, ServiceSettingsView::new(config, &settings::load_secrets(k)))
        })
        .collect()
}

#[tauri::command]
pub async fn save_service(
    app: AppHandle,
    state: State<'_, AppState>,
    service: String,
    config: ServiceConfig,
    secrets: SecretsPatch,
) -> Result<(), String> {
    let kind = ServiceKind::parse(&service).ok_or("servicio desconocido")?;
    let merged = secrets.merge(&settings::load_secrets(kind));
    settings::save_secrets(kind, &merged)?;
    settings::save_config(&app, kind, &config)?;
    let client = ServiceClient::new(kind, config.clone(), merged);
    if config.is_configured() {
        client.probe().await;
    }
    state.registry.set(client).await;
    state.emit_if_changed(&app, true).await;
    Ok(())
}

#[tauri::command]
pub async fn test_service(service: String, config: ServiceConfig, secrets: SecretsPatch) -> Result<String, ApiError> {
    let kind = kind(&service)?;
    let merged = secrets.merge(&settings::load_secrets(kind));
    let client = ServiceClient::new(kind, ServiceConfig { enabled: true, ..config }, merged);
    client.test().await
}

#[tauri::command]
pub async fn api_request(state: State<'_, AppState>, service: String, request: ApiRequest) -> Result<Value, ApiError> {
    let client = state.registry.get(kind(&service)?).await.ok_or(ApiError::NotConfigured)?;
    Ok(client.request(request).await?.body)
}

/// Descarga un .torrent de un enlace del servicio (el `downloadUrl` de Prowlarr) para subirlo a qBittorrent.
#[tauri::command]
pub async fn fetch_torrent(state: State<'_, AppState>, service: String, url: String) -> Result<FetchedTorrent, ApiError> {
    let client = state.registry.get(kind(&service)?).await.ok_or(ApiError::NotConfigured)?;
    let result = client.fetch_torrent(&url).await;
    // Sin la URL: lleva la API key de Prowlarr.
    if let Err(e) = &result {
        log::error!("{service}: descargar torrent -> {e}");
    }
    result
}

#[tauri::command]
pub async fn get_connection_states(state: State<'_, AppState>) -> Result<HashMap<ServiceKind, Option<Route>>, ()> {
    Ok(state.routes().await)
}

#[tauri::command]
pub async fn refresh_connections(app: AppHandle, state: State<'_, AppState>) -> Result<HashMap<ServiceKind, Option<Route>>, ()> {
    state.probe_all(&app, false).await;
    Ok(state.routes().await)
}
