//! «Dasharr Dev» (la versión de prueba de la rama dev) se instala aparte de «Dasharr», con su propio
//! identificador y sus propias carpetas. La primera vez que se abre copia la configuración de Dasharr
//! (servicios, cachés y preferencias de la interfaz) para no tener que configurarlo todo otra vez.
//! Las API keys y contraseñas ya son compartidas: están en el Administrador de credenciales de Windows.

use std::path::{Path, PathBuf};

/// Identificador de la versión publicada, de la que se copia la configuración.
pub const STABLE_ID: &str = "com.vitorsinc.dasharr";

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Qué copiar (origen, destino): la carpeta de datos entera (Roaming) y el `localStorage` del WebView (Local),
/// donde se guardan las preferencias de la interfaz.
pub fn copy_plan(roaming: &Path, local: &Path, id: &str) -> Vec<(PathBuf, PathBuf)> {
    let storage = Path::new("EBWebView").join("Default").join("Local Storage");
    vec![
        (roaming.join(STABLE_ID), roaming.join(id)),
        (local.join(STABLE_ID).join(&storage), local.join(id).join(&storage)),
    ]
}

/// Se llama antes de crear la ventana (el WebView aún no ha abierto su `localStorage`).
/// Solo actúa en Dasharr Dev y solo si todavía no tiene carpeta de datos propia.
pub fn copy_stable_config(id: &str) {
    if id == STABLE_ID {
        return;
    }
    let (Some(roaming), Some(local)) = (std::env::var_os("APPDATA"), std::env::var_os("LOCALAPPDATA")) else {
        return;
    };
    let plan = copy_plan(Path::new(&roaming), Path::new(&local), id);
    if plan[0].1.exists() {
        return; // ya se abrió antes: tiene su propia configuración
    }
    for (from, to) in plan {
        if from.is_dir() && !to.exists() {
            if let Err(e) = copy_dir(&from, &to) {
                // Aún no hay registro (el plugin de logs se inicia después): se muestra en la consola.
                eprintln!("No se pudo copiar {} a {}: {e}", from.display(), to.display());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_stable_folders_into_dev_ones() {
        let (r, l) = (Path::new("R"), Path::new("L"));
        let plan = copy_plan(r, l, "com.vitorsinc.dasharr.dev");
        let storage = Path::new("EBWebView").join("Default").join("Local Storage");
        assert_eq!(plan[0], (r.join("com.vitorsinc.dasharr"), r.join("com.vitorsinc.dasharr.dev")));
        assert_eq!(plan[1], (l.join("com.vitorsinc.dasharr").join(&storage), l.join("com.vitorsinc.dasharr.dev").join(&storage)));
    }

    #[test]
    fn copy_dir_is_recursive() {
        let base = std::env::temp_dir().join(format!("dasharr-migrate-{}", std::process::id()));
        let from = base.join("a");
        std::fs::create_dir_all(from.join("sub")).unwrap();
        std::fs::write(from.join("settings.json"), "{}").unwrap();
        std::fs::write(from.join("sub").join("x"), "1").unwrap();
        copy_dir(&from, &base.join("b")).unwrap();
        assert_eq!(std::fs::read_to_string(base.join("b").join("settings.json")).unwrap(), "{}");
        assert_eq!(std::fs::read_to_string(base.join("b").join("sub").join("x")).unwrap(), "1");
        std::fs::remove_dir_all(base).unwrap();
    }
}
