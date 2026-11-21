/** Texto de versión que se muestra en la app, p. ej. "v0.2.0", "v0.2.0 · dev 233" (CI) o "v0.2.0 · dev a1b2c3d" (en local). */
export function versionLabel(version = __APP_VERSION__, build = __APP_BUILD__) {
  return build ? `v${version} · dev ${build}` : `v${version}`;
}

/** Compilación de prueba (no publicada como versión): no se sustituye sola por la versión publicada. */
export function isDevBuild(build = __APP_BUILD__) {
  return build !== "";
}
