import type { ServiceConfig, ServiceKind } from "./types";

/**
 * Dirección para abrir la web del servicio en el navegador: la externa si hay, si no la local.
 * Plex sirve su interfaz en /web; la raíz solo devuelve XML.
 */
export function serviceWebUrl(service: ServiceKind, config: ServiceConfig | undefined): string | null {
  if (!config?.enabled) return null;
  const raw = config.externalUrl?.trim() || config.localUrl?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  if (service === "plex") {
    const u = new URL(raw);
    if (u.pathname === "/" || u.pathname === "") u.pathname = "/web";
    return u.toString();
  }
  return raw;
}
