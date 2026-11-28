# Copia de la configuración en Google

Ajustes → Sistema → Sincronización con Google guarda la configuración de Dasharr (servicios, claves, clave de TMDB y
preferencias) en la carpeta privada de la app en Google Drive (`appDataFolder`), cifrada con una
contraseña que elige el usuario. Así el PC y el móvil tienen la misma configuración.

## Cómo funciona

- Al abrir Dasharr por primera vez en un dispositivo se pregunta si usar la cuenta de Google
  (`src/components/GoogleWelcome.tsx`, pref de dispositivo `googlePromptSeen`).
- Inicio de sesión en **Android**: dentro de la app, con la hoja de cuentas de Google del sistema
  (`AuthorizationClient` de Play Services, plugin `GoogleAuthPlugin.kt` en `gen/android`). Da un token de
  acceso de una hora que se vuelve a pedir sin enseñar nada. Google reconoce la app por paquete + firma:
  hacen falta los clientes «Android» del proyecto (abajo).
- Inicio de sesión en el **PC**: OAuth para apps instaladas (cliente «App de escritorio»), PKCE y vuelta a
  `http://127.0.0.1:<puerto>` en el navegador; al terminar, Dasharr vuelve al frente. Si el navegador da
  error, se puede pegar su dirección. El token de refresco se guarda con los demás secretos (`google`).
- Permisos: `email` y `drive.appdata` (solo la carpeta privada de la app en Drive).
- Copia: `dasharr-config.json` en `appDataFolder` (formato `dasharr-sync` v2, JSON). No lleva contraseña:
  esa carpeta no se ve en Drive y solo Dasharr puede leerla con el permiso de la cuenta. Las copias v1 (las
  primeras, cifradas con contraseña) se ignoran y se sustituyen.
- Al iniciar sesión: si la cuenta ya tiene copia, se carga en el dispositivo; si no, se sube la de aquí.
- Sincronización (`src/hooks/useGoogleSync.ts`): trae al abrir, cada 5 min y al volver a la app; sube a los
  3 s de cambiar una preferencia, cada 30 s si algo cambió (huella local, sin red) y al dejar la app. Gana el
  último que guarda. Las preferencias de pantalla (`sidebarCollapsed`, `downloadColumns`, `googlePromptSeen`)
  no viajan.

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

## Clientes Android (para iniciar sesión dentro de la app del móvil)

En el mismo proyecto de Google Cloud → **Clientes** → **Crear cliente**, tipo **Android**, dos veces:

| Nombre | Nombre del paquete | Huella SHA-1 |
| --- | --- | --- |
| Dasharr Android | `com.vitorsinc.dasharr` | `FE:A5:25:86:FD:5A:52:E9:EF:5C:3C:F4:EE:03:95:54:47:15:A3:C8` |
| Dasharr Dev Android | `com.vitorsinc.dasharr.dev` | `FE:A5:25:86:FD:5A:52:E9:EF:5C:3C:F4:EE:03:95:54:47:15:A3:C8` |

La huella es la de la clave con la que CI firma las APK (secreto `DASHARR_ANDROID_KEYSTORE`). No hay que
copiar nada de estos clientes a ningún sitio: Google reconoce la app por el paquete y la firma.
