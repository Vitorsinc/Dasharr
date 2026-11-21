/** Dasharr se está ejecutando en un móvil (la app de Android). */
export function isMobile(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return /Android|iPhone|iPad/i.test(ua);
}
