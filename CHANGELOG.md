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
- Anime separado de Series: sección propia en el menú según el tipo de serie de Sonarr. Al buscar, lo que parece anime se marca y se añade ya como anime con su carpeta y perfil (elegibles en Ajustes). El tipo se puede cambiar desde la ficha.
- Búsqueda manual de releases en películas, temporadas y episodios, eligiendo cuál descargar.
- Subtítulos en la búsqueda manual: cada release muestra los idiomas de subtítulos que indica su título (Multi-Subs, [ESP], [ENG][SPA-LA]…) y, en las de Nyaa, los que dice la página del torrent (descripción, MediaInfo o archivos de subtítulos). El español se resalta en verde.
- Importación manual desde la cola de Sonarr/Radarr, asociando cada archivo a su serie/episodio o película, con hardlink.
- Descargas (qBittorrent): control de torrents, añadir por enlace o archivo y aviso de Windows al terminar.
- Buscar en los indexadores de Prowlarr y enviar a qBittorrent.
- Subtítulos que faltan (Bazarr) y búsqueda por idioma.
- Trackers: ratio, subido, bajado, buffer, seed, bonus y H&R de los trackers UNIT3D que tienes en Prowlarr, sin meter claves nuevas.
- Calendario semanal y mensual de estrenos y emisiones.
- Plex: inicio de sesión con tu cuenta (sin copiar tokens), «Reproduciendo ahora» y «Añadido recientemente» en Inicio, página Plex con estado del servidor, escaneo de bibliotecas, papelera y mantenimiento, detener reproducciones (Plex Pass), y en cada ficha si ya está en Plex, si está vista, «Abrir en Plex» y actualizar metadatos. Aviso de Windows cuando alguien empieza a ver algo.
- Ajustes con dirección local y externa por servicio y cambio automático entre ellas; importación de configuración desde archivo.
- Registro de errores y eventos con visor en la app (sin API keys ni contraseñas).
- Versión visible en la barra lateral.
- Actualización automática: aviso al abrir la app y botón en Ajustes; el instalador se verifica con SHA-256.
- Nota de FilmAffinity en las fichas (al momento, con enlace) y sobre los pósters de Películas y Series (se va rellenando poco a poco y se guarda una semana).
- Script `scripts/dasharr-dev.bat` para probar cambios en modo desarrollo sin reinstalar.
- Cola de Sonarr/Radarr: quitar una descarga (y opcionalmente bloquear la release) y "Descargar ya" para las retrasadas.
- La importación manual avisa de si termina bien o falla, en vez de solo "iniciada".
- Descargas: se muestra el motivo de un torrent en error (qBittorrent 5.3+).
- Espacio en disco del servidor siempre visible arriba a la derecha (según Radarr, Sonarr y qBittorrent); al pulsarlo se ven todos los discos, en amarillo o rojo cuando se llenan.
- Tracearr como servicio nuevo: en la ficha de una película se ve quién la ha visto, cuándo y hasta dónde; en la de una serie, quién la sigue y, en cada episodio, quién lo ha visto y cuándo.
- Menú Historial: lo que se está viendo ahora y el historial de reproducciones de Tracearr, con filtro por usuario, por películas o episodios y por vistas completas.
- Calendario con la imagen de cada película o serie de fondo en su barra (el fanart, o el póster si no hay), para reconocerlas de un vistazo.

### Corregido
- qBittorrent 5.x: se acepta la cookie de sesión `QBT_SID_<puerto>` y el acceso sin sesión.
- Las API keys se guardan sin espacios ni saltos de línea al pegarlas.
- Un 401 del proxy inverso se distingue de una API key incorrecta, y el error dice dónde copiar la clave correcta (en Bazarr, la de Settings → General → Security).
- Si el servicio responde una página web en vez de la API, se avisa de que falta la base URL.
- El usuario y la contraseña del proxy solo se envían a la dirección externa.
- qBittorrent 5.2+: API key opcional en lugar de usuario y contraseña.
- Al descargar una release caducada se pide repetir la búsqueda.
- Buscar (Prowlarr): sin enlace magnet, Dasharr descarga el .torrent y se lo entrega a qBittorrent, en vez de pasarle un enlace de Prowlarr que no podía abrir desde fuera de casa.
- Añadir un torrent que qBittorrent rechaza ya no aparece como "enviado".
- Mensajes claros cuando el indexador no entrega una release y cuando Bazarr no encuentra el elemento o no puede guardar el subtítulo.
