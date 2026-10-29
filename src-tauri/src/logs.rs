//! Registro de la aplicación: un archivo `dasharr.log` en la carpeta de logs de Windows
//! (`%LOCALAPPDATA%\com.dasharr.app\logs`), que la pantalla Registro lee y puede vaciar.
//! Nunca se registran API keys, contraseñas ni cuerpos de petición.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const FILE_NAME: &str = "dasharr";
const MAX_LINES: usize = 2000;

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir { file_name: Some(FILE_NAME.into()) }))
        .target(Target::new(TargetKind::Stdout))
        .level(log::LevelFilter::Info)
        // reqwest/hyper son muy verbosos y podrían mostrar cabeceras.
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("hyper", log::LevelFilter::Warn)
        .level_for("hyper_util", log::LevelFilter::Warn)
        .max_file_size(2_000_000)
        .rotation_strategy(RotationStrategy::KeepOne)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

fn log_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_log_dir().map_err(|e| e.to_string())?.join(format!("{FILE_NAME}.log")))
}

#[derive(Serialize)]
pub struct LogFile {
    path: String,
    lines: Vec<String>,
}

/// Últimas líneas del registro (las más recientes al final).
#[tauri::command]
pub fn read_log<R: Runtime>(app: AppHandle<R>) -> Result<LogFile, String> {
    let path = log_path(&app)?;
    let text = fs::read_to_string(&path).unwrap_or_default();
    let all: Vec<&str> = text.lines().collect();
    let lines = all[all.len().saturating_sub(MAX_LINES)..].iter().map(|l| l.to_string()).collect();
    Ok(LogFile { path: path.display().to_string(), lines })
}

#[tauri::command]
pub fn clear_log<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = log_path(&app)?;
    if path.exists() {
        fs::write(&path, "").map_err(|e| e.to_string())?;
    }
    log::info!("Registro vaciado");
    Ok(())
}

/// Errores de la interfaz (pantallas que fallan, acciones rechazadas).
#[tauri::command]
pub fn write_log(level: String, message: String) {
    let message: String = message.chars().take(2000).collect();
    match level.as_str() {
        "error" => log::error!(target: "interfaz", "{message}"),
        "warn" => log::warn!(target: "interfaz", "{message}"),
        _ => log::info!(target: "interfaz", "{message}"),
    }
}
