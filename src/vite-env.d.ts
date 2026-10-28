/// <reference types="vite/client" />

/** Versión de package.json (la misma que tauri.conf.json y Cargo.toml). */
declare const __APP_VERSION__: string;
/** Commit de una build de desarrollo; vacío en las versiones publicadas. */
declare const __APP_BUILD__: string;
