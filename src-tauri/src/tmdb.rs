//! Fechas de estreno por país desde TMDB. La clave se guarda con los demás secretos y nunca
//! vuelve a la interfaz; las respuestas se guardan en memoria unas horas para no repetir consultas.
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use dasharr_core::tmdb::{self, CountryDates, ReleaseDates, TmdbError};
use tauri::State;
use tokio::sync::Mutex;
use tokio::task::JoinSet;

use crate::state::AppState;

const SECRET_NAME: &str = "tmdb";
const TTL: Duration = Duration::from_secs(12 * 3600);
/// Consultas a la vez: TMDB admite muchas más, pero no hace falta.
const PARALLEL: usize = 8;

#[derive(Default)]
pub struct Tmdb {
    http: OnceLock<reqwest::Client>,
    /// `None` hasta la primera lectura del Administrador de credenciales.
    key: Mutex<Option<Option<String>>>,
    cache: Mutex<HashMap<u64, (Instant, CountryDates)>>,
}

impl Tmdb {
    fn http(&self) -> reqwest::Client {
        self.http.get_or_init(tmdb::http_client).clone()
    }

    async fn key(&self) -> Option<String> {
        let mut key = self.key.lock().await;
        key.get_or_insert_with(|| crate::secrets::get(SECRET_NAME).filter(|k| !k.is_empty()))
            .clone()
    }

    /// Olvida la clave leída y las respuestas guardadas (la configuración ha cambiado desde fuera).
    pub async fn forget_key(&self) {
        *self.key.lock().await = None;
        self.cache.lock().await.clear();
    }
}

#[tauri::command]
pub async fn tmdb_has_key(state: State<'_, AppState>) -> Result<bool, ()> {
    Ok(state.tmdb.key().await.is_some())
}

/// Guarda la clave tras comprobarla con TMDB. Una clave vacía la borra.
#[tauri::command]
pub async fn tmdb_save_key(state: State<'_, AppState>, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    let tmdb = &state.tmdb;
    if key.is_empty() {
        crate::secrets::delete(SECRET_NAME)?;
        *tmdb.key.lock().await = Some(None);
    } else {
        tmdb::check_key(&tmdb.http(), tmdb::BASE, &key).await.map_err(|e| e.to_string())?;
        crate::secrets::set(SECRET_NAME, &key)?;
        *tmdb.key.lock().await = Some(Some(key));
    }
    tmdb.cache.lock().await.clear();
    Ok(())
}

/// Fechas de cada película en un país. Las películas que TMDB no tiene, o sin fechas en ese país, no aparecen.
#[tauri::command]
pub async fn tmdb_release_dates(state: State<'_, AppState>, ids: Vec<u64>, country: String) -> Result<HashMap<u64, ReleaseDates>, String> {
    let tmdb = &state.tmdb;
    let Some(key) = tmdb.key().await else { return Ok(HashMap::new()) };
    let country = country.to_uppercase();
    let mut found: HashMap<u64, CountryDates> = HashMap::new();
    let mut missing = Vec::new();
    {
        let cache = tmdb.cache.lock().await;
        for id in ids {
            match cache.get(&id) {
                Some((at, dates)) if at.elapsed() < TTL => {
                    found.insert(id, dates.clone());
                }
                _ => missing.push(id),
            }
        }
    }
    let http = tmdb.http();
    let mut failure = None;
    for chunk in missing.chunks(PARALLEL) {
        let mut set = JoinSet::new();
        for &id in chunk {
            let (http, key) = (http.clone(), key.clone());
            set.spawn(async move { (id, tmdb::release_dates(&http, tmdb::BASE, &key, id).await) });
        }
        while let Some(Ok((id, res))) = set.join_next().await {
            match res {
                Ok(dates) => {
                    tmdb.cache.lock().await.insert(id, (Instant::now(), dates.clone()));
                    found.insert(id, dates);
                }
                Err(e) => failure = Some(e),
            }
        }
        // Con la clave rechazada no tiene sentido seguir preguntando.
        if failure == Some(TmdbError::InvalidKey) {
            break;
        }
    }
    if found.is_empty() {
        if let Some(e) = failure {
            return Err(e.to_string());
        }
    } else if let Some(e) = failure {
        log::warn!("TMDB: faltan fechas de algunas películas ({e})");
    }
    Ok(found.into_iter().filter_map(|(id, mut d)| d.remove(&country).map(|r| (id, r))).collect())
}
