# Copia de la configuración en Google

Ajustes → Sistema → Sincronización con Google guarda la configuración de Dasharr (servicios, claves, clave de TMDB y
preferencias) en la carpeta privada de la app en Google Drive (`appDataFolder`), cifrada con una
contraseña que elige el usuario. Así el PC y el móvil tienen la misma configuración.

## Cómo funciona

- Inicio de sesión: OAuth de Google para apps instaladas (cliente «App de escritorio»), con PKCE y
  redirección a `http://127.0.0.1:<puerto>`. Es igual en Windows y en Android: Dasharr abre el navegador y
  escucha la vuelta en un puerto local. Permisos: `openid email` y `drive.appdata` (solo su carpeta).
- El token de refresco se guarda con los demás secretos (`secrets.rs`, nombre `google`); la contraseña de
  la copia, como `google-sync-key`.
- Copia: un archivo `dasharr-config.json` con AES-256-GCM y clave PBKDF2-SHA256 (310 000 iteraciones).
  Lleva la lista de servicios tal cual (también los que una versión antigua no conoce), los secretos de cada
  servicio y de TMDB, y las preferencias salvo las de pantalla (`sidebarCollapsed`, `downloadColumns`).
- Sincronización (`src/hooks/useGoogleSync.ts`): trae al abrir, cada 5 min y al volver a la app; sube a los
  3 s de cambiar una preferencia, cada 30 s si algo cambió (se compara una huella sin conectarse) y al dejar
  la app. Gana el último que guarda: si al subir hay una copia más nueva, se trae primero.
- La primera vez en un dispositivo, si ya hay copia, se pregunta cuál usar.

## Poner el identificador de Google (una vez)

El identificador se mete en el programa al compilar, con dos secretos del repositorio. Sin ellos la pestaña
dice que esta versión no trae la conexión con Google.

1. Entra en <https://console.cloud.google.com/> con tu cuenta de Gmail y crea un proyecto llamado «Dasharr».
2. Busca «Google Drive API» en la barra de arriba, ábrela y pulsa **Habilitar**.
3. Ve a **Google Auth Platform** (o «Pantalla de consentimiento de OAuth») y pulsa **Comenzar**:
   nombre de la app «Dasharr», tu correo como correo de asistencia, público **Externo**, tu correo de
   contacto, acepta y **Crear**.
4. En **Público**, pulsa **Publicar aplicación** y confirma. (Si la dejas «en prueba», Google retira el
   permiso cada 7 días y habría que volver a iniciar sesión.)
5. En **Clientes**, pulsa **Crear cliente**: tipo de aplicación **App de escritorio**, nombre «Dasharr»,
   **Crear**. Copia el **ID de cliente** y el **Secreto del cliente**.
6. En GitHub: <https://github.com/Vitorsinc/Dasharr/settings/secrets/actions> → **New repository secret**,
   dos veces:
   - `DASHARR_GOOGLE_CLIENT_ID` con el ID de cliente (acaba en `.apps.googleusercontent.com`).
   - `DASHARR_GOOGLE_CLIENT_SECRET` con el secreto (empieza por `GOCSPX-`).

La siguiente compilación de dev (o la siguiente versión) ya trae el inicio de sesión. Si Google muestra
«Google no ha verificado esta aplicación», pulsa **Configuración avanzada → Ir a Dasharr**: es tu propia app.

Para compilar en local: define las mismas dos variables de entorno antes de `npx tauri build`.
