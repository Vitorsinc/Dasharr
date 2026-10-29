use std::collections::HashMap;

use dasharr_core::plex::{self, PlexAccount, PlexServer};
use dasharr_core::{ApiError, ApiRequest, FetchedTorrent, Route, ServiceClient, ServiceConfig, ServiceKind, ServiceSecrets};
use serde::Serialize;
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
    apply_service(&app, &state, kind, config, merged).await
}

async fn apply_service(app: &AppHandle, state: &AppState, kind: ServiceKind, config: ServiceConfig, secrets: ServiceSecrets) -> Result<(), String> {
    settings::save_secrets(kind, &secrets)?;
    settings::save_config(app, kind, &config)?;
    let client = ServiceClient::new(kind, config.clone(), secrets);
    if config.is_configured() {
        client.probe().await;
    }
    state.registry.set(client).await;
    state.emit_if_changed(app, true).await;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlexLoginStart {
    pin_id: u64,
    url: String,
}

/// Pide un PIN a plex.tv. La interfaz abre `url` en el navegador para que el usuario acepte.
#[tauri::command]
pub async fn plex_login_start(state: State<'_, AppState>) -> Result<PlexLoginStart, ApiError> {
    let client_id = settings::load_secrets(ServiceKind::Plex).client_id.unwrap_or_else(plex::new_client_id);
    let account = PlexAccount::new(client_id.clone());
    let pin = account.create_pin().await?;
    let url = account.auth_url(&pin);
    *state.plex_login.lock().await = Some(PlexLogin { client_id, servers: vec![] });
    Ok(PlexLoginStart { pin_id: pin.id, url })
}

/// `None` mientras el usuario no haya aceptado; después, los servidores de su cuenta (sin tokens).
#[tauri::command]
pub async fn plex_login_check(state: State<'_, AppState>, pin_id: u64) -> Result<Option<Vec<PlexServer>>, ApiError> {
    let mut pending = state.plex_login.lock().await;
    let login = pending.as_mut().ok_or(ApiError::NotConfigured)?;
    let account = PlexAccount::new(login.client_id.clone());
    let Some(token) = account.check_pin(pin_id).await? else { return Ok(None) };
    login.servers = account.servers(&token).await?;
    log::info!("plex: sesión iniciada, {} servidor(es) en la cuenta", login.servers.len());
    Ok(Some(login.servers.clone()))
}

/// Guarda el servidor elegido con su token y las direcciones que indique la interfaz.
#[tauri::command]
pub async fn plex_login_finish(app: AppHandle, state: State<'_, AppState>, server_id: String, config: ServiceConfig) -> Result<(), String> {
    let login = state.plex_login.lock().await.take().ok_or("el inicio de sesión con Plex ha caducado, vuelve a empezar")?;
    let server = login.servers.into_iter().find(|s| s.id == server_id).ok_or("servidor de Plex desconocido")?;
    let secrets = ServiceSecrets { api_key: Some(server.token), client_id: Some(login.client_id), ..settings::load_secrets(ServiceKind::Plex) };
    apply_service(&app, &state, ServiceKind::Plex, config, secrets).await
}

pub struct PlexLogin {
    client_id: String,
    servers: Vec<PlexServer>,
}
