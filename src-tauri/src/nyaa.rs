//! Subtítulos de las releases de Nyaa, leídos de la página del torrent. Una petición cada poco más de un
//! segundo, guardando lo ya leído mientras la app sigue abierta; si Nyaa responde 429/403 se para un rato.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use dasharr_core::filmaffinity::Throttle;
use dasharr_core::nyaa::{self, NyaaError};
use tauri::State;
use tokio::sync::Mutex;

use crate::state::AppState;

const GAP: Duration = Duration::from_millis(1500);
const FIRST_BLOCK: Duration = Duration::from_secs(5 * 60);
const MAX_BLOCK: Duration = Duration::from_secs(60 * 60);

#[derive(Default)]
struct Block {
    until: Option<Instant>,
    next: Option<Duration>,
}

#[derive(Default)]
pub struct Nyaa {
    http: OnceLock<reqwest::Client>,
    throttle: Throttle,
    cache: Mutex<HashMap<String, Vec<String>>>,
    block: Mutex<Block>,
}

impl Nyaa {
    async fn languages(&self, url: &str) -> Result<Vec<String>, NyaaError> {
        if let Some(found) = self.cache.lock().await.get(url) {
            return Ok(found.clone());
        }
        if self.block.lock().await.until.is_some_and(|t| t > Instant::now()) {
            return Err(NyaaError::Blocked);
        }
        let result = nyaa::subtitles(self.http.get_or_init(nyaa::http_client), &self.throttle, GAP, url).await;
        let mut block = self.block.lock().await;
        match &result {
            Ok(found) => {
                *block = Block::default();
                self.cache.lock().await.insert(url.to_string(), found.clone());
            }
            Err(NyaaError::Blocked) => {
                let wait = block.next.unwrap_or(FIRST_BLOCK);
                log::warn!("Nyaa ha limitado las consultas; se reintentará en {} min", wait.as_secs() / 60);
                block.until = Some(Instant::now() + wait);
                block.next = Some((wait * 2).min(MAX_BLOCK));
            }
            Err(e) => log::warn!("Nyaa: {e}"),
        }
        result
    }
}

/// Idiomas de subtítulos (códigos como «es», «es-419», «en») de una release de Nyaa; vacío si la página
/// no los indica. `None` si la URL no es de Nyaa.
#[tauri::command]
pub async fn nyaa_subtitles(state: State<'_, AppState>, url: String) -> Result<Option<Vec<String>>, String> {
    let Some(view) = nyaa::view_url(&url) else { return Ok(None) };
    state.nyaa.languages(&view).await.map(Some).map_err(|e| e.to_string())
}
