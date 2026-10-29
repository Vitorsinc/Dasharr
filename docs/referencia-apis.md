# Referencia de APIs de los servicios *arr

Guía para quien programe Dasharr. Sale de leer el código fuente oficial de cada servicio
(clonado el 2026-10-29), no de la documentación web, así que cada punto indica dónde mirar.

| Servicio | Repositorio | Commit estudiado | Versión estable que usan los usuarios |
|---|---|---|---|
| Radarr | `Radarr/Radarr` (rama `develop`) | `c0a0be6` | 6.x, API v3 |
| Sonarr | `Sonarr/Sonarr` (rama `develop`, ya es v5) | `58fe696` | 4.x, API v3 |
| Prowlarr | `Prowlarr/Prowlarr` (rama `develop`) | `23b38d7` | 2.x, API v1 |
| Bazarr | `morpheus65535/bazarr` (rama `master`) | `bfe4593` | 1.5.x |
| qBittorrent | `qbittorrent/qBittorrent` (rama `master`) | `f6cf56c` | 5.1 / 5.2 (5.3 en desarrollo), WebAPI 2.11–2.17 |

Para repetir el estudio: `git clone --depth 1 https://github.com/<repo>.git`.

---

## 1. Autenticación

### Radarr, Sonarr y Prowlarr

`src/*.Http/Authentication/ApiKeyAuthenticationHandler.cs` y `AuthenticationBuilderExtensions.cs`.
La API key se acepta en este orden:

1. Parámetro de consulta `?apikey=...`
2. Cabecera `X-Api-Key` (las cabeceras HTTP no distinguen mayúsculas)
3. `Authorization: Bearer <apikey>`

La autenticación de la interfaz web (Forms, Basic, External, y ahora también OIDC en Radarr) no
afecta a la API: la API key siempre funciona. Dasharr usa la cabecera `X-Api-Key`, que es lo
correcto, y así la clave no queda en los registros de acceso del proxy.

`GET /ping` responde sin autenticación (Dasharr lo usa para detectar si la dirección responde).
`GET /api` devuelve `{ "current": "v3", "deprecated": [] }` y sirve para saber qué versión de API
habla el servidor.

### Bazarr

`bazarr/api/utils.py`, función `authenticate`. Compara **literalmente** la clave de
`settings.auth.apikey` con, por este orden: `?apikey=`, campo de formulario `apikey` y cabecera
`X-API-KEY`. Si ninguna coincide responde `401` sin cabecera `WWW-Authenticate`.

- La autenticación de la interfaz (`basic` o `form`, en `app/ui.py`, `check_login`) **no** se aplica
  a `/api/...`. Solo cuenta la API key.
- Por tanto, un 401 de Bazarr solo puede significar dos cosas: la clave guardada no es la de Bazarr,
  o hay un proxy inverso delante que contesta 401 (Authelia, Authentik…) sin `WWW-Authenticate: Basic`.
- **Trampa habitual:** en Bazarr, *Settings → Sonarr* y *Settings → Radarr* también muestran campos
  "API Key", pero son las claves de Sonarr/Radarr. La de Bazarr está en *Settings → General →
  Security → API Key*.
- **Base URL:** Bazarr monta la API en `<base_url>/api` (`app/server.py`). Si Bazarr tiene base URL
  (p. ej. `/bazarr`) y en Dasharr falta, cualquier ruta inexistente hace `302` a la base URL
  (`app/app.py`, `page_not_found`) y llega el HTML de la interfaz con código 200, no un 401. Si se
  recibe HTML en lugar de JSON, hay que avisar de que falta la base URL.

### qBittorrent

`src/webui/webapplication.cpp`, `processRequest`, `cookieSessionInitialize` y `apiKeySessionInitialize`.

**Sesión con cookie (todas las versiones):**

- `POST /api/v2/auth/login` con formulario `username`, `password`. Devuelve `Ok.` y una cookie.
- La cookie se llama `SID` hasta 4.x y `QBT_SID_<puerto>` desde 5.x (`SESSION_COOKIE_NAME_PREFIX`).
- Con la protección CSRF activa (por defecto), las peticiones deben llevar `Referer` u `Origin` del
  mismo origen que el host al que se llama; si no, `401`. Dasharr manda `Referer: <base>`.
- Desde WebAPI 2.14 (qBittorrent 5.2) un login incorrecto da `401` en vez de `Fails.`.
- Sin sesión válida la API responde `403` (Dasharr re-hace login al ver 403, correcto).
- Si la IP está en la lista blanca de subredes o es localhost con "omitir autenticación local", no
  hace falta login (`isAuthNeeded`).

**API key (qBittorrent 5.2 o superior, WebAPI ≥ 2.14.1):**

- Cabecera `X-API-Key: <clave>` o `Authorization: Bearer <clave>`.
- Con API key **no hay login, ni cookie, ni comprobación CSRF**, y las rutas `auth/*` dan `403`.
- La clave se genera en la interfaz web (*Opciones → WebUI*) o con `POST /api/v2/app/rotateAPIKey`.
- Es la opción más robusta para Dasharr; conviene soportarla además de usuario/contraseña.

**Conflicto con la autenticación Basic del proxy (qBittorrent ≥ 5.2, WebAPI 2.15):**

qBittorrent ahora acepta usuario/contraseña de la WebUI por `Authorization: Basic`. Si no hay cookie
válida y llega una cabecera Basic, la valida como credenciales **de qBittorrent** y responde `401` si
no coinciden. Si Dasharr manda la Basic del proxy inverso y el proxy la reenvía (nginx lo hace por
defecto), `auth/login` falla con 401 aunque usuario y contraseña sean correctos. Soluciones: usar la
API key de qBittorrent (va en `X-API-Key`, no choca con la Basic del proxy), o que el proxy quite la
cabecera `Authorization` antes de reenviar.

---

## 2. Búsqueda manual y descarga de una release (Radarr / Sonarr)

`Radarr.Api.V3/Indexers/ReleaseController.cs`, `Sonarr.Api.V3/Indexers/ReleaseController.cs`.

- Buscar: `GET /api/v3/release?movieId=<id>` (Radarr) o
  `GET /api/v3/release?episodeId=<id>` / `?seriesId=<id>&seasonNumber=<n>` (Sonarr).
  Es una búsqueda real en los indexadores: puede tardar 10–60 s, conviene un timeout largo.
- Cada resultado trae `rejected`, `rejections[]`, `downloadAllowed`, `quality`, `customFormatScore`,
  `seeders`, `size`, `indexer`, `guid`, `indexerId`.
- Descargar: `POST /api/v3/release` con JSON `{ "guid": "...", "indexerId": N }`.
  - El servidor guarda los resultados en caché **30 minutos** con clave `indexerId_guid`. Pasado ese
    tiempo responde `404 "Couldn't find requested release in cache, try searching again"`: hay que
    volver a buscar.
  - `409` = el indexador no devolvió el archivo ("Getting release from indexer failed").
  - Opcional `downloadClientId` para forzar un cliente de descarga concreto.
  - Para descargar algo rechazado por perfil no hace falta nada más; `shouldOverride: true` solo sirve
    para cambiar película/calidad/idiomas detectados (Radarr exige `movieId`, `quality`, `languages`).

## 3. Cola y reintentos

`*/Queue/QueueController.cs`, `QueueActionController.cs`.

- `GET /api/v3/queue?page=1&pageSize=50&includeMovie=true` (Radarr) o
  `&includeSeries=true&includeEpisode=true` (Sonarr). Respuesta paginada: `{ records, totalRecords }`.
- `trackedDownloadState`: `downloading`, `importBlocked`, `importPending`, `importing`, `imported`,
  `failedPending`, `failed`, `ignored`. `trackedDownloadStatus`: `ok`, `warning`, `error`.
  Los motivos están en `statusMessages[].messages[]`.
- Quitar: `DELETE /api/v3/queue/{id}?removeFromClient=true&blocklist=false&skipRedownload=false`.
  Varios: `DELETE /api/v3/queue/bulk` con `{ "ids": [...] }`.
- Descargar ya un elemento retrasado: `POST /api/v3/queue/grab/{id}`.

## 4. Importación manual y hardlinks

`*/ManualImport/ManualImportController.cs`, `NzbDrone.Core/MediaFiles/*Import/Manual/ManualImportService.cs`,
`ImportApproved*.cs`, `MovieFileMovingService.cs` / `EpisodeFileMovingService.cs`.

1. Listar archivos: `GET /api/v3/manualimport?downloadId=<hash>&filterExistingFiles=true`
   (Sonarr acepta además `seriesId`, `seasonNumber`; también vale `folder=<ruta>`).
2. Importar: `POST /api/v3/command` con
   ```json
   { "name": "ManualImport", "importMode": "auto|move|copy",
     "files": [{ "path": "...", "downloadId": "...", "movieId": 1,
                 "quality": {...}, "languages": [...], "releaseGroup": "...", "indexerFlags": 0 }] }
   ```
   En Sonarr cada archivo lleva `seriesId`, `episodeIds[]`, `releaseType` en lugar de `movieId`.
   El comando es asíncrono: seguirlo con `GET /api/v3/command/{id}`.

Qué hace cada `importMode` (`ImportApprovedMovie.Import`):

| Modo | Resultado |
|---|---|
| `copy` | Copia. Si *Settings → Media Management → Use Hardlinks instead of Copy* está activo (por defecto sí, `CopyUsingHardlinks`), crea un **hardlink** y si no puede (distinto disco/volumen) copia. El torrent sigue sembrando. |
| `move` | Mueve el archivo. El torrent deja de poder sembrar. |
| `auto` | Si el archivo pertenece a una descarga conocida, copia mientras el cliente no permita mover (en qBittorrent, mientras no haya terminado de sembrar) y mueve después. **Si falta `downloadId`, `auto` mueve.** |

Conclusión para Dasharr: mandar siempre `downloadId` en cada archivo y usar `copy` por defecto para
torrents. El hardlink solo es posible si la carpeta de descargas y la biblioteca están en el mismo
volumen (en Windows, la misma letra de unidad NTFS; en Docker, el mismo montaje).

## 5. Prowlarr

`Prowlarr.Api.V1/Search/SearchController.cs`, `NzbDrone.Core/Download/DownloadMappingService.cs`.

- Buscar: `GET /api/v1/search?query=...&type=search&indexerIds=1&indexerIds=2&categories=2000&limit=100`.
  `type` puede ser `search`, `tvsearch`, `movie`, `music`, `book`.
- Enviar al cliente configurado **en Prowlarr**: `POST /api/v1/search` con `{ "guid", "indexerId" }`
  (caché de 30 min, mismos 404/409 que Radarr). Varios: `POST /api/v1/search/bulk`.
- `downloadUrl` de cada resultado es un enlace al propio Prowlarr
  (`<url desde la que se llamó>/<id>/download?apikey=...&link=...`). Se construye con la URL que usó
  Dasharr, así que si Dasharr va por la dirección externa, qBittorrent tendrá que descargar desde el
  dominio externo (y fallará si hay Basic auth en el proxy). Para mandar a qBittorrent desde Dasharr:
  - `magnetUrl` si existe: pasarlo tal cual a `torrents/add` (`urls=`).
  - Si no: que Dasharr descargue el `.torrent` con su propio cliente autenticado y lo suba a
    `torrents/add` como archivo (multipart `torrents`), o usar el `POST /api/v1/search` de arriba.
- El `downloadUrl` lleva la API key de Prowlarr: no registrarlo en logs.

## 6. Bazarr

`bazarr/api/**`. Todas las rutas cuelgan de `<base_url>/api/`.

| Para qué | Petición |
|---|---|
| Estado / probar conexión | `GET /api/system/status` |
| Subtítulos que faltan | `GET /api/movies/wanted?start=0&length=-1`, `GET /api/episodes/wanted?start=0&length=-1` → `{ data, total }` |
| Buscar y descargar un idioma | `PATCH /api/movies/subtitles?radarrid=&language=&forced=&hi=` · `PATCH /api/episodes/subtitles?seriesid=&episodeid=&language=&forced=&hi=` (`forced`/`hi` como texto `"true"`/`"false"`). `204` = descargado; `404` si no existe; `409` permisos o mapeo de rutas. |
| Lanzar búsqueda de todo lo que falta | `POST /api/system/tasks?taskid=wanted_search_missing_subtitles_movies` y `..._series` |
| Subir un subtítulo | `POST /api/movies/subtitles` multipart con `file` y los mismos campos |
| Historial | `GET /api/movies/history`, `GET /api/episodes/history` |

Los parámetros se leen de JSON o de la consulta/formulario indistintamente (flask-restx,
`location=('json','values')`). La documentación Swagger del propio servidor está en `<base_url>/api/`.

## 7. qBittorrent: cambios de API que afectan a Dasharr

`WebAPI_Changelog.md` del repositorio.

- 5.0 (WebAPI 2.11): `torrents/pause|resume` pasan a `torrents/stop|start`; estados `pausedDL/UP`
  pasan a `stoppedDL/UP`. Dasharr ya prueba los dos nombres.
- 2.14 (5.2): `torrents/add` responde JSON con `success_count`, `failure_count`, `added_torrent_ids`;
  `202` si queda pendiente, `409` si todo falla. Antes respondía `Ok.`/`Fails.`.
- 2.14.1 / 2.15 (5.2): API key y credenciales por Basic (ver sección 1).
- 2.16 (5.3, aún sin publicar): `torrents/add` ya no acepta `skip_checking`; ahora es `seedMode`.
- 2.17 (5.3): `torrents/info` y `sync/maindata` incluyen `error` con el motivo de un torrent en error.
- Versión de la API: `GET /api/v2/app/webapiVersion`.

## 8. Lo que viene: Sonarr v5

La rama principal de Sonarr ya es v5 (`Sonarr.Api.V5`), y su `GET /api` devuelve
`{ "current": "v5", "deprecated": ["v3"] }`. La API v3 sigue existiendo en v5, así que Dasharr
seguirá funcionando, pero conviene leer `GET /api` al conectar y avisar en el registro si `v3` aparece
como obsoleta.

## 10. Plex

Documentación oficial desde 2025 en `developer.plex.tv` (Plex Media Server) y el foro de desarrolladores
(`forums.plex.tv/c/113`). Dasharr habla con el servidor (puerto 32400) y, solo para iniciar sesión, con plex.tv.

**Cabeceras.** `X-Plex-Token` (el token), `X-Plex-Client-Identifier` (fijo por instalación: el token
queda ligado a él; Dasharr lo genera la primera vez y lo guarda con los secretos, campo `clientId`),
`X-Plex-Product: Dasharr` y `Accept: application/json` (sin ella Plex responde en XML). Todo va en
`crates/dasharr-core/src/plex.rs::identify`. `/identity` responde sin token (sirve para el probe);
`/` lo exige y da `MediaContainer.version` (sirve para "Probar conexión").

**Inicio de sesión con PIN.** `POST https://plex.tv/api/v2/pins?strong=true` → `{id, code}`; abrir
`https://app.plex.tv/auth#?clientID=…&code=…&context[device][product]=Dasharr`; consultar
`GET https://plex.tv/api/v2/pins/{id}` hasta que traiga `authToken`. Con ese token,
`GET https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=0` lista los servidores con su
`accessToken` (el que se guarda) y sus conexiones (`local`, `relay`, `address`, `port`, `uri`). Para la
dirección local se usa `http://IP:32400` en vez de `*.plex.direct`, porque algunos routers bloquean esos
nombres (protección DNS rebinding). El token nunca llega a la interfaz.

**JWT.** Plex está pasando a tokens de 7 días firmados por el propio dispositivo (registrar una clave JWK
en `POST clients.plex.tv/api/v2/auth/jwk`, renovar con `POST …/auth/token`). El token clásico sigue
funcionando; cuando un dispositivo registra su JWK, Plex le retira el clásico. Dasharr aún no lo usa.

**Rutas que usa Dasharr** (todas devuelven `{ MediaContainer: { … } }`):

| Qué | Ruta |
|---|---|
| Reproduciendo ahora | `GET /status/sessions` → `Metadata[]` con `User`, `Player`, `Session` (`id`, `bandwidth` en kbps, `location` lan/wan), `TranscodeSession` |
| Detener | `GET /status/sessions/terminate?sessionId=<Session.id>&reason=…` (requiere Plex Pass; sin él, 401/403) |
| Añadido reciente | `GET /library/recentlyAdded` con `X-Plex-Container-Size` (las series llegan como temporadas) |
| Bibliotecas | `GET /library/sections` → `Directory[]` (`key`, `type`, `refreshing`) |
| Escanear | `GET /library/sections/{key}/refresh`, todas: `/library/sections/all/refresh` |
| Contenido con IDs externos | `GET /library/sections/{key}/all?includeGuids=1` → `Guid[]` (`tmdb://`, `tvdb://`, `imdb://`); agentes antiguos solo traen `guid` (`com.plexapp.agents.imdb://…`) |
| Metadatos de un título | `PUT /library/metadata/{ratingKey}/refresh` |
| Visto / no visto | `GET /:/scrobble` o `/:/unscrobble` con `identifier=com.plexapp.plugins.library&key={ratingKey}` (cuenta del token) |
| Papelera, limpieza, BD | `PUT /library/sections/{key}/emptyTrash`, `PUT /library/clean/bundles`, `PUT /library/optimize?async=1` |
| Tareas en curso | `GET /activities` → `Activity[]` (`title`, `progress`) |
| Actualización | `GET /updater/status` → `Release[]` si hay versión nueva |
| CPU y memoria | `GET /statistics/resources?timespan=6` → `StatisticsResources[]` (la última es la actual) |
| Carátulas | `GET /photo/:/transcode?url=<thumb>&width=…&height=…` |
| Abrir en Plex Web | `https://app.plex.tv/desktop/#!/server/{machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}` |

Ojo: los IDs de TMDB de películas y series son espacios distintos (la película 603 y la serie 603 no
tienen nada que ver), así que el índice se busca siempre por tipo.

**Avisos.** Plex manda webhooks solo con Plex Pass y a una URL que una app de escritorio no tiene. Dasharr
consulta `/status/sessions` cada 10 s y avisa de las sesiones nuevas que no son del dueño (usuario `1`).
Existe también `/:/eventsource/notifications` (eventos `playing`, `activity`…) si algún día hace falta tiempo real de verdad.

**Reparto con Tracearr.** Tracearr guarda el historial por usuario ("quién lo ha visto"); Plex directo se
encarga de la biblioteca, el servidor y lo que se reproduce en este momento.
