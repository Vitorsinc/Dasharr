mod commands;
mod filmaffinity;
mod google;
mod images;
mod letterboxd;
mod logs;
mod migrate;
mod nyaa;
mod secrets;
mod settings;
mod state;
mod sync;
mod tmdb;
mod updater;

use std::time::Duration;

use tauri::Manager;

use state::AppState;

const PROBE_INTERVAL: Duration = Duration::from_secs(60);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    migrate::copy_stable_config(&context.config().identifier);
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None));
    builder
        .plugin(logs::plugin())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
            commands::plex_users,
            commands::unit3d_stats,
            commands::unit3d_deals,
            commands::unit3d_fetch_torrent,
            logs::read_log,
            logs::clear_log,
            logs::write_log,
            updater::check_update,
            updater::install_update,
            filmaffinity::filmaffinity_ratings,
            filmaffinity::filmaffinity_rating,
            filmaffinity::filmaffinity_clear_queue,
            letterboxd::letterboxd_ratings,
            letterboxd::letterboxd_rating,
            letterboxd::letterboxd_clear_queue,
            nyaa::nyaa_subtitles,
            tmdb::tmdb_has_key,
            tmdb::tmdb_save_key,
            tmdb::tmdb_release_dates,
            sync::google_status,
            sync::google_login,
            sync::google_login_cancel,
            sync::google_logout,
            sync::sync_set_password,
            sync::sync_push,
            sync::sync_pull,
            sync::sync_delete_remote,
        ])
        .setup(|app| {
            log::info!("Dasharr {} iniciado", app.package_info().version);
            let handle = app.handle().clone();
            secrets::init(app.path().app_data_dir()?);
            // Los clientes se crean antes de abrir la ventana para que las primeras peticiones no fallen como "no configurado".
            tauri::async_runtime::block_on(handle.state::<AppState>().load(&handle));
            tauri::async_runtime::block_on(handle.state::<AppState>().filmaffinity.load(&handle));
            let fa_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                fa_handle.state::<AppState>().filmaffinity.run_worker(fa_handle.clone()).await;
            });
            tauri::async_runtime::block_on(handle.state::<AppState>().letterboxd.load(&handle));
            let lb_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                lb_handle.state::<AppState>().letterboxd.run_worker(lb_handle.clone()).await;
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
        .run(context)
        .expect("error al iniciar Dasharr");
}
