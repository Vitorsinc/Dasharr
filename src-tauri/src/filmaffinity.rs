//! Notas de FilmAffinity con caché en disco (`filmaffinity.json` en AppData).
//! La ficha abierta se consulta al momento; las listas se rellenan en segundo plano, una petición cada pocos
//! segundos, para que FilmAffinity no bloquee la IP. Si aun así responde 429/403, se para un rato.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dasharr_core::filmaffinity::{self, FaError, FaMatch, FaQuery, Throttle};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::{Mutex, Notify};

use crate::state::AppState;

pub const RATING_EVENT: &str = "filmaffinity-rating";
// v2: la v1 guardó como "sin coincidencia" todo lo buscado antes de adaptar la lectura a la web de 2026.
const CACHE_FILE: &str = "filmaffinity-v2.json";
const OLD_CACHE_FILES: [&str; 1] = ["filmaffinity.json"];
const PRIORITY_GAP: Duration = Duration::from_secs(1);
const BACKGROUND_GAP: Duration = Duration::from_secs(4);
const FIRST_BLOCK: Duration = Duration::from_secs(10 * 60);
const MAX_BLOCK: Duration = Duration::from_secs(2 * 60 * 60);
const DAY: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Movie,
    Series,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaItem {
    pub kind: MediaKind,
    /// tmdbId en películas, tvdbId en series: no cambia aunque se renombre en Radarr/Sonarr.
    pub id: u64,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
}

impl FaItem {
    fn key(&self) -> String {
        let kind = match self.kind {
            MediaKind::Movie => "movie",
            MediaKind::Series => "series",
        };
        format!("{kind}:{}", self.id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    found: Option<FaMatch>,
    checked: u64,
}

impl Entry {
    /// Con nota se revisa cada semana; sin coincidencia o sin nota todavía, cada tres días.
    fn is_fresh(&self, now: u64) -> bool {
        let ttl = if self.found.as_ref().is_some_and(|m| m.rating.is_some()) { 7 * DAY } else { 3 * DAY };
        now.saturating_sub(self.checked) < ttl
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RatingEvent {
    key: String,
    rating: Option<FaMatch>,
}

#[derive(Default)]
struct Block {
    until: Option<Instant>,
    next: Option<Duration>,
}

#[derive(Default)]
pub struct FilmAffinity {
    http: OnceLock<reqwest::Client>,
    path: OnceLock<PathBuf>,
    dump_dir: OnceLock<PathBuf>,
    throttle: Throttle,
    cache: Mutex<HashMap<String, Entry>>,
    queue: Mutex<VecDeque<FaItem>>,
    wake: Notify,
    block: Mutex<Block>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or_default()
}

impl FilmAffinity {
    fn http(&self) -> &reqwest::Client {
        self.http.get_or_init(filmaffinity::http_client)
    }

    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) {
        if let Ok(logs) = app.path().app_log_dir() {
            let _ = std::fs::create_dir_all(&logs);
            let _ = self.dump_dir.set(logs);
        }
        let Ok(dir) = app.path().app_data_dir() else { return };
        for old in OLD_CACHE_FILES {
            let _ = std::fs::remove_file(dir.join(old));
        }
        let path = dir.join(CACHE_FILE);
        if let Ok(text) = std::fs::read_to_string(&path) {
            match serde_json::from_str(&text) {
                Ok(map) => *self.cache.lock().await = map,
                Err(e) => log::warn!("FilmAffinity: caché ilegible, se empieza de cero ({e})"),
            }
        }
        let _ = self.path.set(path);
    }

    async fn save(&self, cache: &HashMap<String, Entry>) {
        let Some(path) = self.path.get() else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Err(e) = serde_json::to_string(cache).map(|json| std::fs::write(path, json)) {
            log::warn!("FilmAffinity: no se pudo guardar la caché ({e})");
        }
    }

    async fn blocked(&self) -> Option<Duration> {
        let block = self.block.lock().await;
        block.until.and_then(|t| t.checked_duration_since(Instant::now()))
    }

    async fn on_result(&self, result: &Result<Option<FaMatch>, FaError>) {
        let mut block = self.block.lock().await;
        match result {
            Err(FaError::Blocked) => {
                let wait = block.next.unwrap_or(FIRST_BLOCK);
                log::warn!("FilmAffinity ha limitado las consultas; se reintentará en {} min", wait.as_secs() / 60);
                block.until = Some(Instant::now() + wait);
                block.next = Some((wait * 2).min(MAX_BLOCK));
            }
            Ok(_) => *block = Block::default(),
            Err(_) => {}
        }
    }

    async fn fetch(&self, item: &FaItem, gap: Duration) -> Result<Option<FaMatch>, FaError> {
        if self.blocked().await.is_some() {
            return Err(FaError::Blocked);
        }
        let mut titles = vec![];
        if let Some(t) = item.original_title.as_deref() {
            titles.push(t);
        }
        titles.push(item.title.as_str());
        let q = FaQuery { titles, year: item.year, series: item.kind == MediaKind::Series, dump_dir: self.dump_dir.get().map(PathBuf::as_path) };
        let result = filmaffinity::lookup(self.http(), &self.throttle, gap, &q).await;
        self.on_result(&result).await;
        result
    }

    async fn store<R: Runtime>(&self, app: &AppHandle<R>, key: String, found: Option<FaMatch>) {
        let mut cache = self.cache.lock().await;
        cache.insert(key.clone(), Entry { found: found.clone(), checked: now_secs() });
        self.save(&cache).await;
        drop(cache);
        let _ = app.emit(RATING_EVENT, RatingEvent { key, rating: found });
    }

    /// Bucle en segundo plano que va vaciando la cola.
    pub async fn run_worker<R: Runtime>(&self, app: AppHandle<R>) {
        loop {
            if let Some(wait) = self.blocked().await {
                tokio::time::sleep(wait).await;
            }
            let Some(item) = self.queue.lock().await.pop_front() else {
                self.wake.notified().await;
                continue;
            };
            let key = item.key();
            if self.cache.lock().await.get(&key).is_some_and(|e| e.is_fresh(now_secs())) {
                continue;
            }
            match self.fetch(&item, BACKGROUND_GAP).await {
                Ok(found) => self.store(&app, key, found).await,
                Err(FaError::Blocked) => self.queue.lock().await.push_front(item),
                Err(e) => log::warn!("FilmAffinity: {e}"),
            }
        }
    }
}

/// Notas guardadas de una lista (aunque estén caducadas) y, las que falten, a la cola en segundo plano.
/// Las de la última lista pedida pasan por delante.
#[tauri::command]
pub async fn filmaffinity_ratings(state: State<'_, AppState>, items: Vec<FaItem>) -> Result<HashMap<String, FaMatch>, ()> {
    let fa = &state.filmaffinity;
    let now = now_secs();
    let mut out = HashMap::new();
    let mut pending = Vec::new();
    {
        let cache = fa.cache.lock().await;
        for item in items {
            let entry = cache.get(&item.key());
            if let Some(m) = entry.and_then(|e| e.found.clone()) {
                out.insert(item.key(), m);
            }
            if !entry.is_some_and(|e| e.is_fresh(now)) {
                pending.push(item);
            }
        }
    }
    if !pending.is_empty() {
        let mut queue = fa.queue.lock().await;
        let keys: HashSet<String> = pending.iter().map(FaItem::key).collect();
        let rest: Vec<FaItem> = queue.drain(..).filter(|i| !keys.contains(&i.key())).collect();
        queue.extend(pending);
        queue.extend(rest);
        drop(queue);
        fa.wake.notify_one();
    }
    Ok(out)
}

/// Nota de una ficha: de la caché si está al día, si no se consulta ya.
#[tauri::command]
pub async fn filmaffinity_rating<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, item: FaItem) -> Result<Option<FaMatch>, String> {
    let fa = &state.filmaffinity;
    let key = item.key();
    let cached = fa.cache.lock().await.get(&key).cloned();
    if let Some(e) = &cached {
        if e.is_fresh(now_secs()) {
            return Ok(e.found.clone());
        }
    }
    match fa.fetch(&item, PRIORITY_GAP).await {
        Ok(found) => {
            fa.store(&app, key, found.clone()).await;
            Ok(found)
        }
        // Mejor una nota de hace unos días que ninguna.
        Err(_) if cached.as_ref().is_some_and(|e| e.found.is_some()) => Ok(cached.and_then(|e| e.found)),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(rating: Option<f32>, found: bool, age_days: u64) -> Entry {
        let m = FaMatch { id: 1, url: String::new(), title: "x".into(), year: None, rating, votes: None };
        Entry { found: found.then_some(m), checked: 100 * DAY - age_days * DAY }
    }

    #[test]
    fn freshness_depends_on_result() {
        let now = 100 * DAY;
        assert!(entry(Some(7.0), true, 6).is_fresh(now));
        assert!(!entry(Some(7.0), true, 8).is_fresh(now));
        assert!(entry(None, false, 2).is_fresh(now));
        assert!(!entry(None, false, 4).is_fresh(now));
        assert!(!entry(None, true, 4).is_fresh(now));
    }

    #[test]
    fn keys_by_kind_and_id() {
        let item: FaItem =
            serde_json::from_str(r#"{"kind":"series","id":81189,"title":"Breaking Bad","originalTitle":null,"year":2008}"#).unwrap();
        assert_eq!(item.key(), "series:81189");
    }
}
