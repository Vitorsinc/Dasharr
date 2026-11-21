//! Secretos (API keys, contraseñas, tokens): en el escritorio, en el almacén del sistema (Administrador de
//! credenciales de Windows); en Android, que no tiene un almacén al que llegar sin Java, en un archivo dentro
//! de la carpeta privada de la app, que el sistema no deja leer a otras apps.

/// Prefijo común de todos los secretos de Dasharr.
#[cfg(desktop)]
const SERVICE: &str = "dasharr";

#[cfg(desktop)]
mod imp {
    fn entry(name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(super::SERVICE, name).map_err(|e| e.to_string())
    }

    pub fn init(_dir: std::path::PathBuf) {}

    pub fn get(name: &str) -> Option<String> {
        entry(name).ok()?.get_password().ok()
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        entry(name)?.set_password(value).map_err(|e| format!("No se pudo guardar en el Administrador de credenciales: {e}"))
    }

    pub fn delete(name: &str) -> Result<(), String> {
        match entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(mobile)]
mod imp {
    use std::collections::BTreeMap;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};

    static DIR: OnceLock<PathBuf> = OnceLock::new();
    static LOCK: Mutex<()> = Mutex::new(());

    pub fn init(dir: PathBuf) {
        let _ = DIR.set(dir);
    }

    fn path() -> Result<PathBuf, String> {
        DIR.get().map(|d| d.join("secrets.json")).ok_or_else(|| "Almacén de secretos sin iniciar".to_string())
    }

    fn read() -> BTreeMap<String, String> {
        path().ok().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    fn write(all: &BTreeMap<String, String>) -> Result<(), String> {
        let p = path()?;
        if let Some(dir) = p.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        // Se escribe aparte y se renombra para no dejar el archivo a medias si la app se cierra.
        let tmp = p.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(all).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &p).map_err(|e| format!("No se pudo guardar el secreto: {e}"))
    }

    pub fn get(name: &str) -> Option<String> {
        let _g = LOCK.lock().ok()?;
        read().remove(name)
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        let _g = LOCK.lock().map_err(|e| e.to_string())?;
        let mut all = read();
        all.insert(name.to_string(), value.to_string());
        write(&all)
    }

    pub fn delete(name: &str) -> Result<(), String> {
        let _g = LOCK.lock().map_err(|e| e.to_string())?;
        let mut all = read();
        if all.remove(name).is_some() {
            write(&all)?;
        }
        Ok(())
    }
}

pub use imp::{delete, get, init, set};
