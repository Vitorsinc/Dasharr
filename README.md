# Dasharr

Dashboard de escritorio para Windows que reúne Radarr, Sonarr, Prowlarr, Bazarr y qBittorrent, inspirado en nzb360.

## Instalar

Descarga el instalador `.exe` de la última versión en [Releases](../../releases) y ejecútalo.

## Desarrollo

```bash
npm install
npm run tauri dev     # app en modo desarrollo
npm test              # pruebas de la interfaz
cargo test -p dasharr-core   # pruebas del núcleo de red
```

Especificación: `docs/superpowers/specs/2026-10-27-dasharr-mvp-design.md`.

## Primeros pasos

1. Abre **Ajustes**.
2. Para cada servicio rellena la **dirección local** (por ejemplo `http://192.168.1.50:7878`) y, si accedes desde fuera de casa, la **dirección externa** (por ejemplo `https://radarr.midominio.com`).
3. Pega la **API key** (en Radarr, Sonarr, Prowlarr y Bazarr está en *Settings → General*). En qBittorrent usa tu usuario y contraseña de la interfaz web.
4. Si tu proxy inverso pide usuario y contraseña, despliega *Autenticación del proxy*.
5. Pulsa **Probar conexión** y después **Guardar**.

Dasharr usa la dirección local cuando responde y cambia sola a la externa cuando no. Las API keys y contraseñas se guardan en el Administrador de credenciales de Windows.
