//! Notas de Letterboxd (solo películas, por id de TMDb) con caché en disco (`letterboxd.json` en AppData).
//! Igual que FilmAffinity: la ficha abierta se consulta al momento y las listas se rellenan en segundo plano,
//! con pausa entre peticiones; si Letterboxd responde 429/403, se para un rato.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dasharr_core::letterboxd::{self, LbError, LbMatch, Throttle};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::{Mutex, Notify};

use crate::state::AppState;

pub const RATING_EVENT: &str = "letterboxd-rating";
const CACHE_FILE: &str = "letterboxd.json";
const PRIORITY_GAP: Duration = Duration::from_secs(1);
const BACKGROUND_GAP: Duration = Duration::from_secs(3);
const FIRST_BLOCK: Duration = Duration::from_secs(10 * 60);
const MAX_BLOCK: Duration = Duration::from_secs(2 * 60 * 60);
const DAY: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    found: Option<LbMatch>,
    checked: u64,
}

impl Entry {
    /// Con nota se revisa cada semana; sin ficha o sin nota todavía, cada tres días.
    fn is_fresh(&self, now: u64) -> bool {
        let ttl = if self.found.as_ref().is_some_and(|m| m.rating.is_some()) {
            7 * DAY
        } else {
            3 * DAY
        };
        now.saturating_sub(self.checked) < ttl
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RatingEvent {
    tmdb_id: u64,
    rating: Option<LbMatch>,
}

#[derive(Default)]
struct Block {
    until: Option<Instant>,
    next: Option<Duration>,
}

#[derive(Default)]
pub struct Letterboxd {
    http: OnceLock<reqwest::Client>,
    path: OnceLock<PathBuf>,
    throttle: Throttle,
    /// Por id de TMDb.
    cache: Mutex<HashMap<u64, Entry>>,
    queue: Mutex<VecDeque<u64>>,
    wake: Notify,
    block: Mutex<Block>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

impl Letterboxd {
    fn http(&self) -> &reqwest::Client {
        self.http.get_or_init(letterboxd::http_client)
    }

    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) {
        let Ok(dir) = app.path().app_data_dir() else {
            return;
        };
        let path = dir.join(CACHE_FILE);
        if let Ok(text) = std::fs::read_to_string(&path) {
            match serde_json::from_str(&text) {
                Ok(map) => *self.cache.lock().await = map,
                Err(e) => log::warn!("Letterboxd: caché ilegible, se empieza de cero ({e})"),
            }
        }
        let _ = self.path.set(path);
    }

    async fn save(&self, cache: &HashMap<u64, Entry>) {
        let Some(path) = self.path.get() else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Err(e) = serde_json::to_string(cache).map(|json| std::fs::write(path, json)) {
            log::warn!("Letterboxd: no se pudo guardar la caché ({e})");
        }
    }

    async fn blocked(&self) -> Option<Duration> {
        let block = self.block.lock().await;
        block
            .until
            .and_then(|t| t.checked_duration_since(Instant::now()))
    }

    async fn fetch(&self, tmdb_id: u64, gap: Duration) -> Result<Option<LbMatch>, LbError> {
        if self.blocked().await.is_some() {
            return Err(LbError::Blocked);
        }
        let result =
            letterboxd::lookup(self.http(), &self.throttle, gap, letterboxd::BASE, tmdb_id).await;
        let mut block = self.block.lock().await;
        match &result {
            Err(LbError::Blocked) => {
                let wait = block.next.unwrap_or(FIRST_BLOCK);
                log::warn!(
                    "Letterboxd ha limitado las consultas; se reintentará en {} min",
                    wait.as_secs() / 60
                );
                block.until = Some(Instant::now() + wait);
                block.next = Some((wait * 2).min(MAX_BLOCK));
            }
            Ok(_) => *block = Block::default(),
            Err(_) => {}
        }
        result
    }

    async fn store<R: Runtime>(&self, app: &AppHandle<R>, tmdb_id: u64, found: Option<LbMatch>) {
        let mut cache = self.cache.lock().await;
        cache.insert(
            tmdb_id,
            Entry {
                found: found.clone(),
                checked: now_secs(),
            },
        );
        self.save(&cache).await;
        drop(cache);
        let _ = app.emit(
            RATING_EVENT,
            RatingEvent {
                tmdb_id,
                rating: found,
            },
        );
    }

    /// Bucle en segundo plano que va vaciando la cola.
    pub async fn run_worker<R: Runtime>(&self, app: AppHandle<R>) {
        loop {
            if let Some(wait) = self.blocked().await {
                tokio::time::sleep(wait).await;
            }
            let Some(id) = self.queue.lock().await.pop_front() else {
                self.wake.notified().await;
                continue;
            };
            if self
                .cache
                .lock()
                .await
                .get(&id)
                .is_some_and(|e| e.is_fresh(now_secs()))
            {
                continue;
            }
            match self.fetch(id, BACKGROUND_GAP).await {
                Ok(found) => self.store(&app, id, found).await,
                Err(LbError::Blocked) => self.queue.lock().await.push_front(id),
                Err(e) => log::warn!("Letterboxd: {e}"),
            }
        }
    }
}

/// Notas guardadas de una lista (aunque estén caducadas) y, las que falten, a la cola en segundo plano.
/// Las de la última lista pedida pasan por delante.
#[tauri::command]
pub async fn letterboxd_ratings(
    state: State<'_, AppState>,
    tmdb_ids: Vec<u64>,
) -> Result<HashMap<u64, LbMatch>, ()> {
    let lb = &state.letterboxd;
    let now = now_secs();
    let mut out = HashMap::new();
    let mut pending = Vec::new();
    {
        let cache = lb.cache.lock().await;
        for id in tmdb_ids {
            let entry = cache.get(&id);
            if let Some(m) = entry.and_then(|e| e.found.clone()) {
                out.insert(id, m);
            }
            if !entry.is_some_and(|e| e.is_fresh(now)) {
                pending.push(id);
            }
        }
    }
    if !pending.is_empty() {
        let mut queue = lb.queue.lock().await;
        let ids: HashSet<u64> = pending.iter().copied().collect();
        let rest: Vec<u64> = queue.drain(..).filter(|i| !ids.contains(i)).collect();
        queue.extend(pending);
        queue.extend(rest);
        drop(queue);
        lb.wake.notify_one();
    }
    Ok(out)
}

/// Vacía la cola en segundo plano (al ocultar Letterboxd en Ajustes).
#[tauri::command]
pub async fn letterboxd_clear_queue(state: State<'_, AppState>) -> Result<(), ()> {
    state.letterboxd.queue.lock().await.clear();
    Ok(())
}

/// Nota de una ficha: de la caché si está al día, si no se consulta ya.
#[tauri::command]
pub async fn letterboxd_rating<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    tmdb_id: u64,
) -> Result<Option<LbMatch>, String> {
    let lb = &state.letterboxd;
    let cached = lb.cache.lock().await.get(&tmdb_id).cloned();
    if let Some(e) = &cached {
        if e.is_fresh(now_secs()) {
            return Ok(e.found.clone());
        }
    }
    match lb.fetch(tmdb_id, PRIORITY_GAP).await {
        Ok(found) => {
            lb.store(&app, tmdb_id, found.clone()).await;
            Ok(found)
        }
        // Mejor una nota de hace unos días que ninguna.
        Err(_) if cached.as_ref().is_some_and(|e| e.found.is_some()) => {
            Ok(cached.and_then(|e| e.found))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(rating: Option<f32>, found: bool, age_days: u64) -> Entry {
        let m = LbMatch {
            url: String::new(),
            title: "x".into(),
            rating,
            votes: None,
        };
        Entry {
            found: found.then_some(m),
            checked: 100 * DAY - age_days * DAY,
        }
    }

    #[test]
    fn freshness_depends_on_result() {
        let now = 100 * DAY;
        assert!(entry(Some(3.9), true, 6).is_fresh(now));
        assert!(!entry(Some(3.9), true, 8).is_fresh(now));
        assert!(entry(None, false, 2).is_fresh(now));
        assert!(!entry(None, false, 4).is_fresh(now));
    }
}
