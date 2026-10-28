# Cambios

Dasharr sigue el [versionado semántico](https://semver.org/lang/es/): `MAYOR.MENOR.PARCHE`.
Mientras la versión empiece por `0.`, cada versión **menor** (0.**2**.0) trae funciones nuevas
y cada **parche** (0.2.**1**) solo corrige errores.

Cómo publicar una versión: `npm run version:set -- X.Y.Z`, commit, y etiqueta `vX.Y.Z`.
GitHub Actions comprueba que la etiqueta coincide con la versión, compila el instalador y
crea la Release con las notas de esta página.

## [Sin publicar]

### Añadido
- Inicio con el estado de cada servicio, descargas activas y próximos estrenos.
- Películas (Radarr) y Series (Sonarr): biblioteca, fichas, añadir, buscar, monitorizar, borrar y cola.
- Búsqueda manual de releases en películas, temporadas y episodios, eligiendo cuál descargar.
- Importación manual desde la cola de Sonarr/Radarr, asociando cada archivo a su serie/episodio o película, con hardlink.
- Descargas (qBittorrent): control de torrents, añadir por enlace o archivo y aviso de Windows al terminar.
- Buscar en los indexadores de Prowlarr y enviar a qBittorrent.
- Subtítulos que faltan (Bazarr) y búsqueda por idioma.
- Calendario semanal y mensual de estrenos y emisiones.
- Ajustes con dirección local y externa por servicio y cambio automático entre ellas; importación de configuración desde archivo.
- Registro de errores y eventos con visor en la app (sin API keys ni contraseñas).
- Versión visible en la barra lateral.

### Corregido
- qBittorrent 5.x: se acepta la cookie de sesión `QBT_SID_<puerto>` y el acceso sin sesión.
- Las API keys se guardan sin espacios ni saltos de línea al pegarlas.
- Un 401 del proxy inverso se distingue de una API key incorrecta.
