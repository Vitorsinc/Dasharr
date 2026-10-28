/** Texto de versión que se muestra en la app, p. ej. "v0.2.0" o "v0.2.0 · dev a1b2c3d". */
export function versionLabel(version = __APP_VERSION__, build = __APP_BUILD__) {
  return build ? `v${version} · dev ${build}` : `v${version}`;
}
