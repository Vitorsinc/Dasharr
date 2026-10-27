mod commands;
mod images;
mod settings;
mod state;

use std::time::Duration;

use tauri::Manager;

use state::AppState;

const PROBE_INTERVAL: Duration = Duration::from_secs(60);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol(images::SCHEME, images::handle)
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_service,
            commands::test_service,
            commands::api_request,
            commands::get_connection_states,
            commands::refresh_connections,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
                state.load(&handle).await;
                state.probe_all(&handle, true).await;
                loop {
                    tokio::time::sleep(PROBE_INTERVAL).await;
                    state.probe_all(&handle, false).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Dasharr");
}
