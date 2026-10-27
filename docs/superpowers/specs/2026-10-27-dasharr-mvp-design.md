# Dasharr: diseño del MVP

Fecha: 2026-10-27 · Estado: borrador para revisión

## 1. Objetivo

Dasharr es una aplicación de escritorio para Windows, inspirada en nzb360 (Android), que reúne en un solo dashboard la gestión de Radarr, Sonarr, Prowlarr, Bazarr y qBittorrent.

**Criterios de éxito del MVP**

- Instalar con un único instalador `.msi`/`.exe` descargado desde GitHub.
- Configurar los cinco servicios desde Ajustes y ver que todos conectan.
- Hacer desde Dasharr, sin abrir las webs de cada servicio, las tareas del día a día: ver y controlar descargas, añadir películas y series, buscar en indexadores, revisar el calendario y lanzar búsquedas de subtítulos.
- Funcionar igual en casa (red local) y fuera (dirección externa), cambiando de una a otra sin intervención.

**Fuera del alcance del MVP**: Lidarr, Readarr, SABnzbd/NZBGet, Overseerr/Jellyseerr, Plex/Jellyfin, varios perfiles de servidores, actualizaciones automáticas de la app, macOS/Linux (el stack lo permite más adelante).

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Contenedor | Tauri 2 (Rust) | Instalador ligero (~10 MB), WebView2 nativo de Windows, peticiones HTTP desde Rust sin CORS |
| UI | React 18 + TypeScript + Vite | Ecosistema maduro, rápido de iterar |
| Estilos | Tailwind CSS + componentes shadcn/ui (Radix) | Interfaz moderna y accesible, tema oscuro/claro |
| Datos | TanStack Query | Caché, refresco periódico, reintentos y estados de carga |
| Navegación | React Router | Rutas por pantalla |
| Secretos | crate `keyring` (Administrador de credenciales de Windows) | No guardar API keys en texto plano |
| Configuración | `tauri-plugin-store` (JSON en AppData) | Datos no secretos: URLs, preferencias |
| Notificaciones | `tauri-plugin-notification` | Aviso al terminar descargas |
| Build | GitHub Actions en `windows-latest` | Genera el instalador sin que haga falta compilar en local |

## 3. Arquitectura

```
React (pantallas) ──invoke──> Comandos Tauri (Rust) ──HTTP──> Radarr / Sonarr / Prowlarr / Bazarr / qBittorrent
        │                              │
  TanStack Query                Resolución local/externa
  (caché y refresco)            Autenticación por servicio
                                Credenciales (keyring) + config (store)
```

### 3.1 Capa Rust (`src-tauri`)

Una única puerta de salida a la red, para que la UI nunca maneje secretos:

- `api_request(service, method, path, query?, body?) -> { status, json }`: resuelve la URL base del servicio, añade la autenticación y hace la petición con `reqwest`.
- `test_connection(service, draft_config) -> { ok, version?, error? }`: usado por el botón "Probar conexión" antes de guardar.
- `save_service_config` / `get_service_configs`: guarda URLs y preferencias en el store y los secretos en keyring. La UI recibe solo si el secreto existe, nunca su valor.
- `get_connection_state() -> { service: "local" | "remote" | "offline" }`.
- Protocolo propio `dasharr-img://<servicio>/<ruta>` para cargar pósters a través de Rust (las imágenes de Radarr/Sonarr requieren API key).

**Autenticación por servicio**

| Servicio | API | Autenticación |
|---|---|---|
| Radarr | `/api/v3` | Cabecera `X-Api-Key` |
| Sonarr | `/api/v3` | Cabecera `X-Api-Key` |
| Prowlarr | `/api/v1` | Cabecera `X-Api-Key` |
| Bazarr | `/api` | Cabecera `X-API-KEY` |
| qBittorrent | `/api/v2` | Usuario y contraseña → cookie `SID` (login en `/api/v2/auth/login`, se renueva sola si caduca con 403) |

Además, cada servicio admite opcionalmente usuario y contraseña HTTP Basic para el proxy inverso de la dirección externa.

### 3.2 Cambio automático local/externo

- Cada servicio guarda `localUrl` (opcional) y `externalUrl` (opcional); al menos una es obligatoria.
- Al arrancar, y cada 60 s, Rust prueba la `localUrl` con un tiempo de espera de 1,5 s (`/ping` en los *arr, `/api/v2/app/version` en qBittorrent). Si responde, se usa la local; si no, la externa.
- Si una petición falla por error de red, se vuelve a probar inmediatamente antes de dar el servicio por caído.
- El estado se emite a la UI como evento Tauri y se muestra como insignia "Local" / "Remoto" / "Sin conexión".

### 3.3 Capa React (`src`)

- `src/api/<servicio>.ts`: funciones tipadas por servicio sobre `api_request` (por ejemplo `radarr.getMovies()`, `qbit.pause(hashes)`). Cada módulo es independiente y se puede probar con respuestas simuladas.
- `src/hooks/`: hooks de TanStack Query por recurso, con su intervalo de refresco.
- `src/pages/`: una carpeta por pantalla.
- `src/components/`: piezas reutilizables (tarjeta de póster, barra de progreso, insignia de estado, panel de error).

**Intervalos de refresco** (solo con la ventana visible; se pausan al minimizar)

| Recurso | Intervalo |
|---|---|
| Torrents de qBittorrent | 2 s |
| Colas de Radarr/Sonarr | 10 s |
| Estado de servicios | 60 s |
| Biblioteca, calendario, subtítulos | 5 min o al volver a la pantalla |

## 4. Pantallas

Barra lateral fija con iconos y texto: **Inicio, Películas, Series, Descargas, Buscar, Subtítulos, Calendario, Ajustes**. Tema oscuro por defecto, con opción de claro o según el sistema. Un servicio sin configurar muestra en su pantalla un acceso directo a Ajustes.

### 4.1 Inicio
- Tarjeta por servicio: nombre, versión, insignia Local/Remoto/Sin conexión.
- Descargas activas (las 5 primeras de qBittorrent) con velocidad total de bajada y subida.
- Próximos estrenos de los siguientes 7 días (Radarr + Sonarr) en una tira horizontal de pósters.

### 4.2 Películas (Radarr)
- Cuadrícula de pósters con buscador y filtros: todas, descargadas, faltan, monitorizadas. Orden por título, fecha de añadido o año.
- Ficha: sinopsis, calidad, archivo, tamaño, estado; acciones **Buscar ahora**, **Monitorizar on/off**, **Borrar** (con opción de borrar archivos y confirmación).
- Botón **+**: búsqueda (`/movie/lookup`), elegir perfil de calidad y carpeta raíz, opción "buscar al añadir".
- Pestaña **Cola**: elementos en descarga desde Radarr con progreso.

### 4.3 Series (Sonarr)
- Igual que Películas, con ficha por temporadas y episodios (descargado / falta / no emitido).
- Acciones por serie, temporada y episodio: buscar, monitorizar.
- Añadir: `/series/lookup`, perfil de calidad, carpeta raíz, qué monitorizar (todo, futuros, última temporada).
- Pestaña **Cola**.

### 4.4 Descargas (qBittorrent)
- Cabecera: velocidad total, límite alternativo de velocidad on/off, espacio libre.
- Lista con nombre, tamaño, progreso, velocidad, ETA, estado y categoría; filtros por estado y categoría; selección múltiple.
- Acciones: pausar, reanudar, forzar inicio, borrar (con o sin archivos), recomprobar.
- Añadir: enlace magnet/URL o archivo `.torrent`, con categoría.
- Notificación de Windows cuando un torrent pasa a completado.

### 4.5 Buscar (Prowlarr)
- Campo de búsqueda con selector de categoría (películas, series, todas) e indexadores.
- Resultados con título, indexador, tamaño, seeders/leechers y antigüedad; ordenables.
- Botón **Enviar a qBittorrent** (usa el magnet o el enlace de descarga del resultado, con categoría elegible).

### 4.6 Subtítulos (Bazarr)
- Dos pestañas: películas y episodios con subtítulos que faltan, indicando idiomas.
- Acción **Buscar** por elemento y **Buscar todos**.

### 4.7 Calendario
- Vista semanal (por defecto) y mensual que combina estrenos de Radarr y emisiones de Sonarr, con color por origen y estado (descargado / pendiente).
- Al pulsar un elemento se abre su ficha.

### 4.8 Ajustes
- Un bloque por servicio: URL local, URL externa, API key (o usuario y contraseña en qBittorrent), usuario y contraseña del proxy (opcional), botón **Probar conexión**.
- Preferencias: tema, notificaciones on/off, iniciar con Windows (off por defecto).

## 5. Errores

- Cada pantalla gestiona su propio estado de error: si un servicio cae, solo su sección muestra un panel "No se puede conectar con Radarr" con el motivo (tiempo de espera, 401 API key incorrecta, etc.) y botón **Reintentar**. El resto de la app sigue funcionando.
- Las acciones (pausar, borrar, añadir) muestran un aviso breve de éxito o de error.
- Las acciones destructivas (borrar) piden confirmación.
- Los errores de Rust se devuelven tipados (`Network`, `Unauthorized`, `NotConfigured`, `Http(status)`) para mostrar mensajes claros en español.

## 6. Idioma

Interfaz en español. Los textos se centralizan en un archivo para poder añadir inglés más adelante.

## 7. Pruebas

- **Rust**: pruebas unitarias de la resolución local/externa y de la autenticación por servicio contra un servidor HTTP simulado (`wiremock`).
- **React**: pruebas con Vitest y Testing Library de los módulos `src/api` y de los componentes clave, con respuestas de ejemplo de cada API.
- **CI**: GitHub Actions ejecuta lint, pruebas y build en cada PR; en cada etiqueta `v*` publica el instalador de Windows como Release.
- **Prueba manual**: Vitor instala la Release y la prueba contra sus servicios reales.

## 8. Fases de implementación

1. Esqueleto Tauri + React, diseño visual base, CI con instalador.
2. Capa Rust: configuración, credenciales, `api_request`, cambio local/externo. Pantalla de Ajustes.
3. Descargas (qBittorrent) e Inicio.
4. Películas y Series (biblioteca, fichas, añadir, colas).
5. Calendario.
6. Buscar (Prowlarr) y Subtítulos (Bazarr).
7. Notificaciones y pulido; primera Release `v0.1.0`.
