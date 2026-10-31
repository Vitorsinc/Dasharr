# Cambios

Dasharr sigue el [versionado semántico](https://semver.org/lang/es/): `MAYOR.MENOR.PARCHE`.
Mientras la versión empiece por `0.`, cada versión **menor** (0.**2**.0) trae funciones nuevas
y cada **parche** (0.2.**1**) solo corrige errores.

Cómo publicar una versión: `npm run version:set -- X.Y.Z`, commit, y etiqueta `vX.Y.Z`.
GitHub Actions comprueba que la etiqueta coincide con la versión, compila el instalador y
crea la Release con las notas de esta página.
También se puede lanzar a mano en Actions → Release → «Run workflow» indicando la versión
(sin la `v`): crea la etiqueta sobre master y publica igual.

## [Sin publicar]

### Añadido
- Actualizaciones automáticas: Dasharr mira si hay versión nueva al abrirse y cada 6 horas, avisa y la instala sola tras 30 segundos (con «Instalar ahora» o «Más tarde»). Se puede desactivar en Ajustes → Sistema, donde también se ven las novedades de la versión nueva y se instala con un clic. El menú lateral muestra «Actualizar a vX» mientras haya una pendiente.
- Las portadas de Películas, Series y Anime muestran las notas activadas en Ajustes → Notas (FilmAffinity, IMDb, TMDb, Rotten Tomatoes, Metacritic, Trakt, TVDB) en un panel lateral, una por fila y alineadas.
- Ordenar la biblioteca por cualquiera de esas notas, de mayor a menor; lo que aún no tiene nota va al final.
- Radarr y Sonarr: nueva sección «Actividad» en el menú de cada uno con la lista de releases bloqueadas (blocklist): quitar una, varias seleccionadas o vaciarla entera, siempre con confirmación. En el historial de descargas de cada ficha, «Marcar como fallida» en las descargas enviadas para que la bloquee y busque otra.
- Radarr y Sonarr: nueva sección «Gestión» con los ajustes de biblioteca. Perfiles de calidad: crear (desde la plantilla del *arr), editar nombre, calidades permitidas y su orden de preferencia, si se mejora y hasta qué calidad, puntuación mínima y de corte, y la puntuación de cada formato personalizado; borrar. Formatos personalizados: lista con en cuántos perfiles puntúan, importar o editar como JSON (el de las guías TRaSH o el exportado de la web) y borrar. Etiquetas: crear, renombrar, borrar y ver dónde se usan. Carpetas raíz: añadir y quitar, con espacio libre y carpetas sin importar. Perfiles de retraso: crear, editar (protocolos, retrasos, preferido, etiquetas) y borrar.
- Etiquetas en las fichas de películas y series (se activan y desactivan con un clic) y filtro por etiqueta en la biblioteca.
- Edición masiva en Películas, Series y Anime: botón «Seleccionar» para elegir varias portadas (o todas las visibles con el filtro actual) y, a la vez, monitorizarlas o no, cambiar el perfil de calidad, añadir, quitar o sustituir etiquetas, cambiarlas de carpeta raíz moviendo los archivos (avisando antes) o borrarlas con o sin archivos.
- Gestión → Listas: las listas de importación de Radarr/Sonarr (Trakt, TMDb, watchlist de Plex…) para activarlas, desactivarlas, borrarlas o sincronizarlas ya. Gestión → Exclusiones: lo que las listas no deben volver a añadir, con filtro y botón para quitar cada una.
- Al borrar una película o serie (en su ficha o varias a la vez) se puede marcar «Añadir a las exclusiones» para que las listas no la vuelvan a añadir.
- Fichas de película: botones para actualizar la información, reescanear la carpeta y renombrar el archivo (con vista previa), y borrar solo el archivo (con confirmación), como ya tenían las series.
- Indexadores (Prowlarr) en pestañas. Indexadores: añadir uno nuevo eligiéndolo de la lista de Prowlarr y rellenando su formulario (los campos que pide cada indexador, con opciones avanzadas aparte), probarlo antes de guardar, editarlo y borrarlo; si Prowlarr lo rechaza se ve el motivo. Estadísticas: búsquedas, RSS, descargas, fallos y tiempo de respuesta de cada indexador, con totales. Historial: búsquedas, descargas, RSS e inicios de sesión, filtrable y por páginas. Aplicaciones: a qué Radarr/Sonarr manda los indexadores y botón para sincronizarlos ya.
- Radarr y Sonarr → Actividad → Historial: el historial de descargas de todo el servicio (enviadas, importadas, fallidas, borradas, renombradas), por páginas y filtrable por tipo, con «Marcar como fallida» en las enviadas. Es distinto del Historial de Plex/Tracearr, que sigue mostrando lo que se ha visto.

### Corregido
- Las versiones publicadas a mano desde Actions ya no se muestran como compilación de prueba («· dev abc1234»).

## [0.1.0] - 2026-10-31

### Añadido
- Ajustes → Notas: elige qué notas se muestran (FilmAffinity, IMDb, TMDb, Rotten Tomatoes, Metacritic, Trakt, TVDB). Si se quita FilmAffinity, deja de consultarse.
- Las fichas muestran también las notas que traen Radarr (IMDb, TMDb, Rotten Tomatoes, Metacritic, Trakt) y Sonarr (TVDB), junto a la de FilmAffinity.
- Inicio con el estado de cada servicio, descargas activas y próximos estrenos.
- Películas (Radarr) y Series (Sonarr): biblioteca, fichas, añadir, buscar, monitorizar, borrar y cola.
- Anime separado de Series: sección propia en el menú según el tipo de serie de Sonarr. Al buscar, lo que parece anime se marca y se añade ya como anime con su carpeta y perfil (elegibles en Ajustes). El tipo se puede cambiar desde la ficha.
- Búsqueda manual de releases en películas, temporadas y episodios, eligiendo cuál descargar. Cada temporada y episodio muestra las dos búsquedas con los iconos de Radarr/Sonarr (lupa = automática, persona = manual), y al añadir se puede elegir no buscar, búsqueda automática o manual.
- Resultados de la búsqueda manual: se ordenan pulsando cualquier columna (título, indexador, calidad, tamaño, semillas, antigüedad, puntuación) y se filtran por palabras (`-palabra` excluye).
- Los episodios de cada temporada se listan del más reciente al más antiguo, como en Sonarr.
- Lista de episodios más limpia: el número del episodio coloreado (verde descargado, borde rojo falta, gris sin emitir) y el marcador de Sonarr/Radarr para monitorizado (relleno) o no (vacío).
- Subtítulos en la búsqueda manual: cada release muestra los idiomas de subtítulos que indica su título (Multi-Subs, [ESP], [ENG][SPA-LA]…) y, en las de Nyaa, los que dice la página del torrent (descripción, MediaInfo o archivos de subtítulos). El español se resalta en verde. Entiende los formatos de los grupos más populares (SubsPlease, Erai-raws, ToonsHub, VARYG, Judas, Yameii, EMBER, ASW, DKB, AnoZu, Rapta, Tsundere-Raws…) y marca VOSTFR como francés.
- Importación manual desde la cola de Sonarr/Radarr, asociando cada archivo a su serie/episodio o película, con hardlink.
- Películas y Series: pestaña «Buscadas» con lo que falta y lo que puede mejorar de calidad, con búsqueda de todo de una vez (en Series y Anime, solo los de su sección).
- Fichas de película y serie: historial de descargas de Radarr/Sonarr (enviada, importada, fallida, borrada…) y botón «Editar» para cambiar el perfil de calidad y la carpeta (moviendo los archivos). En películas, también la disponibilidad mínima; en series, qué episodios se monitorizan.
- Series: monitorizar o dejar de monitorizar una temporada entera de un clic, ver la calidad y el tamaño del archivo de cada episodio y borrarlo, y botones para actualizar, reescanear la carpeta y renombrar (con vista previa).
- Descargas (qBittorrent): control de torrents, añadir por enlace o archivo y aviso de Windows al terminar.
- Buscar en los indexadores de Prowlarr y enviar a qBittorrent.
- Descargas: ficha de cada torrent (pulsa su nombre) con datos generales, archivos para elegir cuáles bajar y con qué prioridad, trackers y pares. Cambiar la categoría y limitar la velocidad de uno o de varios seleccionados a la vez.
- Indexadores (Prowlarr): nueva sección con el estado de cada indexador (funciona, falla, en pausa por fallos), activar o desactivar y probar uno o todos, con el motivo si falla.
- Subtítulos (Bazarr): búsqueda manual que lista los subtítulos de cada proveedor con su puntuación para elegir cuál bajar, e historial de lo descargado.
- Inicio: avisos de salud de Radarr, Sonarr, Prowlarr y Bazarr (lo que cada uno enseña en System → Status), también en Indexadores para Prowlarr.
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
- Calendario: la semana se puede ver como Agenda, Pósters o Por día.
- Películas: próximos estrenos en cines y en digital según el país elegido.
- Inicio: botón en cada tarjeta para abrir la web del servicio en el navegador.
- Trackers: icono en la esquina de cada tarjeta para abrir la web del tracker.
- Avatares de Plex de cada usuario en el historial y en las fichas.

### Cambiado
- Ajustes se divide en pestañas: Servicios, Contenido, Aspecto, Notificaciones, Sistema y Registro. El Registro deja de tener entrada propia en el menú lateral y pasa a ser una pestaña de Ajustes.
- El menú lateral se agrupa por servicio (Radarr, Sonarr, qBittorrent, Prowlarr, Bazarr, Plex), con su logo.
  Cada grupo se puede plegar y Dasharr recuerda cuáles has plegado.
- Rediseño: cada sección toma el color de su servicio, con tipografía propia. Anime usa un icono de puerta torii.
- Descargas: se quita la tarjeta de espacio libre, que ya se ve en la parte de arriba.

### Corregido
- Notas de FilmAffinity: se adapta la lectura a la nueva página de búsqueda de FilmAffinity, se detecta su aviso de "demasiadas consultas" y se descarta la caché anterior, que había guardado todo como "sin nota".
- qBittorrent 5.x: se acepta la cookie de sesión `QBT_SID_<puerto>` y el acceso sin sesión.
- Las API keys se guardan sin espacios ni saltos de línea al pegarlas.
- Los pósters de las fichas mantienen su proporción en vez de estirarse y recortarse.
- Un 401 del proxy inverso se distingue de una API key incorrecta, y el error dice dónde copiar la clave correcta (en Bazarr, la de Settings → General → Security).
- Si el servicio responde una página web en vez de la API, se avisa de que falta la base URL.
- El usuario y la contraseña del proxy solo se envían a la dirección externa.
- qBittorrent 5.2+: API key opcional en lugar de usuario y contraseña.
- Al descargar una release caducada se pide repetir la búsqueda.
- Buscar (Prowlarr): sin enlace magnet, Dasharr descarga el .torrent y se lo entrega a qBittorrent, en vez de pasarle un enlace de Prowlarr que no podía abrir desde fuera de casa.
- Añadir un torrent que qBittorrent rechaza ya no aparece como "enviado".
- Mensajes claros cuando el indexador no entrega una release y cuando Bazarr no encuentra el elemento o no puede guardar el subtítulo.
