# Dasharr MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows desktop app (Tauri) that manages Radarr, Sonarr, Prowlarr, Bazarr and qBittorrent from one dashboard, as described in the spec.

**Architecture:** A Rust crate `dasharr-core` (no Tauri dependency, testable on Linux with wiremock) owns URL resolution local/remote, per-service auth and HTTP. The Tauri crate `src-tauri` wraps it with settings storage (store plugin), secrets (keyring), commands, an image protocol and a connection-state event. The React app talks only through `invoke`, with one typed module per service and TanStack Query hooks per resource.

**Tech Stack:** Tauri 2, Rust (reqwest, tokio, serde, wiremock, keyring), React 18, TypeScript, Vite, Tailwind CSS 3, Radix primitives, lucide-react, TanStack Query 5, React Router 6, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-27-dasharr-mvp-design.md`

## Global Constraints

- Target: Windows 10/11 x64, installer `.msi` + NSIS `.exe` built by GitHub Actions on `windows-latest`.
- All UI copy in Spanish, centralised in `src/i18n/es.ts`.
- The UI never receives secret values; only `hasApiKey`/`hasPassword` style booleans.
- Local probe timeout 1.5 s; re-probe every 60 s and immediately after a network error.
- Refresh intervals (window visible only): qBittorrent torrents 2 s, Radarr/Sonarr queues 10 s, service status 60 s, library/calendar/subtitles 5 min.
- Dark theme by default; light and "system" options.
- Destructive actions ask for confirmation.
- Error kinds: `NotConfigured`, `Network`, `Unauthorized`, `Http(status)`.

## Review Focus

1. Any HTTP response from the local URL (including 401/403) means "reachable" — a wrong API key must show `Unauthorized`, not silently switch to remote.
2. qBittorrent SID expiry: a 403 on a request triggers one re-login and one retry, never an infinite loop.
3. qBittorrent 5.x renamed `pause`/`resume` to `stop`/`start`; the UI must work with both (try new name, fall back on 404).
4. Non-JSON responses (qBittorrent returns plain text like `Ok.` or `v4.6.2`) must not be reported as errors.
5. URLs typed with trailing slash or with a base path (`https://x.com/radarr/`) must join correctly with API paths.

---

## File Structure

```
Cargo.toml                       workspace: crates/dasharr-core, src-tauri
crates/dasharr-core/src/
  lib.rs                         re-exports
  model.rs                       ServiceKind, ServiceConfig, ServiceSecrets, Route, ApiRequest, ApiBody, ApiResponse
  error.rs                       ApiError
  url.rs                         join_url(base, path)
  client.rs                      ServiceClient (probe, request, bytes, test)
  registry.rs                    Registry (HashMap<ServiceKind, Arc<ServiceClient>>)
crates/dasharr-core/tests/       wiremock integration tests
src-tauri/src/
  main.rs, lib.rs                app setup, plugins
  settings.rs                    load/save configs (store) + secrets (keyring)
  commands.rs                    tauri commands
  monitor.rs                     60 s probe loop, emits "connection-changed"
  images.rs                      dasharr-img protocol
src/
  main.tsx, App.tsx              router + QueryClient + theme
  i18n/es.ts                     all strings
  lib/tauri.ts                   typed invoke wrappers
  lib/types.ts                   shared TS types mirroring Rust
  lib/format.ts                  bytes, speed, eta, dates
  api/{qbit,radarr,sonarr,prowlarr,bazarr}.ts
  hooks/                         useServiceQuery, useConnectionStates, per-resource hooks
  components/                    Layout, Sidebar, StatusBadge, ErrorPanel, PosterCard, ProgressBar, ConfirmDialog, Toaster, NotConfigured
  pages/{Home,Movies,Series,Downloads,Search,Subtitles,Calendar,Settings}/
.github/workflows/ci.yml, release.yml
```

## Shared interfaces (used by many tasks)

Rust (`dasharr-core::model`):
```rust
enum ServiceKind { Radarr, Sonarr, Prowlarr, Bazarr, Qbittorrent }   // serde: lowercase
struct ServiceConfig { local_url: Option<String>, external_url: Option<String>, enabled: bool }
struct ServiceSecrets { api_key, username, password, proxy_username, proxy_password: Option<String> }
enum Route { Local, Remote, Offline }                                 // serde: lowercase
enum ApiBody { Json(Value), Form(Vec<(String,String)>), Multipart(Vec<FilePart>) }
struct FilePart { field: String, filename: String, base64: String }
struct ApiRequest { method: String, path: String, query: Vec<(String,String)>, body: Option<ApiBody> }
struct ApiResponse { status: u16, body: Value }                      // non-JSON text → Value::String
enum ApiError { NotConfigured, Network(String), Unauthorized, Http { status: u16, message: String } }
```

TS (`src/lib/tauri.ts`):
```ts
apiRequest<T>(service: ServiceKind, req: { method?: string; path: string; query?: Record<string,string|number|boolean>; json?: unknown; form?: Record<string,string>; files?: FilePart[] }): Promise<T>
getSettings(): Promise<Record<ServiceKind, ServiceSettingsView>>
saveService(service, config: ServiceConfig, secrets: SecretsPatch): Promise<void>
testService(service, config, secrets: SecretsPatch): Promise<{ version: string }>
getConnectionStates(): Promise<Record<ServiceKind, Route>>
onConnectionChanged(cb): Promise<UnlistenFn>
imageUrl(service, path): string
```
`SecretsPatch` fields: `undefined` = keep stored value, `""` = clear, string = set. Errors reject with `{ kind: 'NotConfigured'|'Network'|'Unauthorized'|'Http', status?, message? }`.

---

### Task 1: Scaffold, layout and CI

**Files:** root `package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/i18n/es.ts`, `src/components/{Layout,Sidebar}.tsx`, placeholder pages, `Cargo.toml`, `src-tauri/*` (tauri.conf.json, capabilities, icons), `crates/dasharr-core` stub, `.github/workflows/{ci,release}.yml`, `README.md`.

- [ ] Test `src/App.test.tsx`: rendering `<App/>` shows sidebar links Inicio, Películas, Series, Descargas, Buscar, Subtítulos, Calendario, Ajustes; clicking "Ajustes" shows heading "Ajustes".
- [ ] Implement scaffold; `npm test`, `npm run build`, `cargo test --workspace --exclude dasharr` pass.
- [ ] CI: `ci.yml` (ubuntu: npm ci, lint, test, build, cargo test core; windows: `tauri build` on push to main, upload installer artifact). `release.yml`: on tag `v*`, tauri-action creates GitHub Release with installers.
- [ ] Commit.

### Task 2: Core URL resolution and probing

**Interfaces produced:** `join_url(base: &str, path: &str) -> Result<Url, ApiError>`; `ServiceClient::new(kind, config, secrets) -> ServiceClient`; `ServiceClient::probe(&self) -> Route` (caches result + base URL).

- [ ] Tests: `join_url("http://h:7878/", "/api/v3/movie")` → `http://h:7878/api/v3/movie`; `join_url("https://x.com/radarr", "/api/v3/movie")` → `https://x.com/radarr/api/v3/movie`; probe returns Local when local answers 401; Remote when local unreachable (closed port) and external answers; Offline when neither; Remote when only external configured; probe path per kind (`/ping` for arr, `/api/system/status` Bazarr, `/api/v2/app/version` qBit).
- [ ] Implement with reqwest, connect timeout 1.5 s for local probe.
- [ ] Commit.

### Task 3: Core auth and requests

**Interfaces produced:** `ServiceClient::request(&self, ApiRequest) -> Result<ApiResponse, ApiError>`, `ServiceClient::bytes(&self, path) -> Result<(Vec<u8>, String), ApiError>`, `ServiceClient::test(&self) -> Result<String, ApiError>` (version), `Registry::{new, set, get, all}`.

- [ ] Tests (wiremock): Radarr/Sonarr/Prowlarr send `X-Api-Key`; Bazarr sends `X-API-KEY`; proxy creds add Basic auth; qBit logs in with form `username`/`password`, stores `SID`, sends cookie; 403 → re-login once and retry, second 403 → `Unauthorized`; 401 → `Unauthorized`; 500 → `Http{500}`; text body `Ok.` → `Value::String("Ok.")`; form and JSON bodies encoded correctly; network error triggers re-probe once then `Network`; missing URLs → `NotConfigured`; `test()` parses version for each kind (arr `version`, Bazarr `data.bazarr_version`, qBit text).
- [ ] Implement; commit.

### Task 4: Tauri shell: settings, secrets, commands, monitor, images

**Interfaces produced:** commands `get_settings`, `save_service`, `test_service`, `api_request`, `get_connection_states`; event `connection-changed` with payload `Record<ServiceKind, Route>`; protocol `dasharr-img` (`http://dasharr-img.localhost/<kind>/<path>` on Windows).

- [ ] Settings in store `settings.json` key `services`; secrets in keyring service `dasharr`, user `<kind>`, JSON value. Patch semantics per Shared interfaces.
- [ ] Monitor task: every 60 s probe all enabled clients; emit when any route changes.
- [ ] Plugins: store, notification, autostart, dialog (torrent file picker).
- [ ] `cargo check -p dasharr` passes on Linux; commit.

### Task 5: Frontend plumbing and Ajustes

- [ ] Tests: `lib/format.ts` (`formatBytes(1536)`→`1,5 KB`, `formatSpeed`, `formatEta(3661)`→`1 h 1 min`, `∞` for 8640000); `apiRequest` maps rejected error objects; Settings page loads configs, "Probar conexión" shows `Conectado · v5.2.0` on success and the Spanish message for `Unauthorized` ("API key incorrecta"), saves with patch semantics (untouched secret field → `undefined`).
- [ ] Implement `lib/tauri.ts`, `lib/types.ts`, `hooks/useConnectionStates`, `components/{StatusBadge,ErrorPanel,NotConfigured,Toaster,ConfirmDialog}`, `pages/Settings` (one card per service + preferences: tema, notificaciones, iniciar con Windows).
- [ ] Commit.

### Task 6: Descargas (qBittorrent)

**Interfaces produced (`api/qbit.ts`):** `getTorrents(filter?)`, `getTransferInfo()`, `pause(hashes)`, `resume(hashes)` (try `stop`/`start`, fallback `pause`/`resume` on 404), `forceStart(hashes)`, `recheck(hashes)`, `remove(hashes, deleteFiles)`, `addUrls(urls, category?)`, `addFile(file, category?)`, `getCategories()`, `toggleAltSpeed()`, `getAltSpeedState()`, `getFreeSpace()` (from `/api/v2/sync/maindata` `server_state.free_space_on_disk`).

- [ ] Tests: resume falls back on 404; Downloads page lists torrents with progress %, filter by state, multi-select pause calls api with joined `hash1|hash2`; delete asks confirmation; completion detector `detectCompleted(prev, next)` returns torrents whose progress went <1 → 1.
- [ ] Implement page + notification hook (only when notifications enabled). Commit.

### Task 7: Inicio

- [ ] Test: renders service cards with badges, top 5 active torrents, upcoming 7-day strip; a failing service shows ErrorPanel only in its card.
- [ ] Implement (reuses hooks from 6, 8, 9, 10). Commit after Task 10 data hooks exist (implement with the hooks as they land).

### Task 8: Películas (Radarr)

**Interfaces (`api/radarr.ts`):** `getMovies()`, `getMovie(id)`, `lookup(term)`, `addMovie({tmdbId,title,year,qualityProfileId,rootFolderPath,monitored,searchForMovie})`, `updateMovie(movie)`, `deleteMovie(id, deleteFiles)`, `search(movieIds)` (command `MoviesSearch`), `getQueue()`, `getQualityProfiles()`, `getRootFolders()`, `getCalendar(start,end)`, `posterUrl(movie)`.

- [ ] Tests: filters (downloaded = `hasFile`, missing = monitored && !hasFile, monitored), sort by title/added/year; add dialog posts correct payload; delete confirmation.
- [ ] Implement grid, detail drawer, add dialog, Cola tab. Commit.

### Task 9: Series (Sonarr)

**Interfaces (`api/sonarr.ts`):** `getSeries()`, `getSeriesById(id)`, `getEpisodes(seriesId)`, `lookup(term)`, `addSeries({tvdbId,title,qualityProfileId,rootFolderPath,monitored,monitor:'all'|'future'|'latestSeason',searchForMissingEpisodes})`, `updateSeries`, `setEpisodesMonitored(ids, monitored)`, `deleteSeries(id, deleteFiles)`, `searchSeries(id)`, `searchSeason(id, n)`, `searchEpisodes(ids)`, `getQueue()`, `getQualityProfiles()`, `getRootFolders()`, `getCalendar(start,end)`.

- [ ] Tests: episode status (descargado / falta / no emitido by `hasFile` and `airDateUtc`); add payload; season search command.
- [ ] Implement reusing Movies components. Commit.

### Task 10: Calendario

- [ ] Tests: `mergeCalendar(movies, episodes)` produces items `{id, source, title, date, hasFile}` using Radarr `digitalRelease ?? physicalRelease ?? inCinemas`; week grid places items on correct day; month view toggle.
- [ ] Implement; Home strip uses the same hook. Commit.

### Task 11: Buscar (Prowlarr)

**Interfaces (`api/prowlarr.ts`):** `getIndexers()`, `search({query, categories, indexerIds})` (`GET /api/v1/search?type=search`), results `{guid,title,indexer,size,seeders,leechers,age,downloadUrl,magnetUrl}`.

- [ ] Tests: sort by size/seeders/age; "Enviar a qBittorrent" calls `qbit.addUrls([magnetUrl ?? downloadUrl], category)`.
- [ ] Implement. Commit.

### Task 12: Subtítulos (Bazarr)

**Interfaces (`api/bazarr.ts`):** `getWantedMovies()` (`/api/movies/wanted`), `getWantedEpisodes()` (`/api/episodes/wanted`), `searchMovie(radarrId)` (`PATCH /api/movies?radarrid=&action=search-missing`), `searchEpisode(seriesId, episodeId)` (`PATCH /api/episodes?seriesid=&episodeid=&action=search-missing`... verify against Bazarr swagger), `searchAllWanted()` (`POST /api/system/tasks?taskid=wanted_search_missing_subtitles_movies` and `_series`).

- [ ] Tests: lists render missing languages; search buttons call the right endpoint.
- [ ] Implement. Commit.

### Task 13: Polish and release

- [ ] Theme switch persisted; refresh pauses when `document.hidden`; app icon; README in Spanish with install and setup steps.
- [ ] Full test run, push, open PR, then tag `v0.1.0` after merge to produce the Release.
