mod commands;
mod filmaffinity;
mod images;
mod logs;
mod settings;
mod state;
mod updater;

use std::time::Duration;

use tauri::Manager;

use state::AppState;

const PROBE_INTERVAL: Duration = Duration::from_secs(60);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(logs::plugin())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol(images::SCHEME, images::handle)
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_service,
            commands::test_service,
            commands::api_request,
            commands::fetch_torrent,
            commands::get_connection_states,
            commands::refresh_connections,
            commands::plex_login_start,
            commands::plex_login_check,
            commands::plex_login_finish,
            logs::read_log,
            logs::clear_log,
            logs::write_log,
            updater::check_update,
            updater::install_update,
            filmaffinity::filmaffinity_ratings,
            filmaffinity::filmaffinity_rating,
        ])
        .setup(|app| {
            log::info!("Dasharr {} iniciado", app.package_info().version);
            let handle = app.handle().clone();
            // Los clientes se crean antes de abrir la ventana para que las primeras peticiones no fallen como "no configurado".
            tauri::async_runtime::block_on(handle.state::<AppState>().load(&handle));
            tauri::async_runtime::block_on(handle.state::<AppState>().filmaffinity.load(&handle));
            let fa_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                fa_handle.state::<AppState>().filmaffinity.run_worker(fa_handle.clone()).await;
            });
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
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
