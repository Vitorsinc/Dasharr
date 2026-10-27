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
