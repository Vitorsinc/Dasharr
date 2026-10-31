import type { ServiceKind } from "./types";

export const SERVICES_SETTINGS_PATH = "/ajustes/servicios";

/** Ruta de un servicio en Ajustes → Servicios y, en Radarr/Sonarr, de una de sus secciones de gestión. */
export function serviceSettingsPath(service: ServiceKind, section?: string) {
  return `${SERVICES_SETTINGS_PATH}/${service}${section ? `/${section}` : ""}`;
}
