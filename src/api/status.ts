import { apiRequest } from "@/lib/tauri";
import type { ServiceKind } from "@/lib/types";

const str = (v: unknown) => (typeof v === "string" && v ? v : "?");

/** Versión del servicio; sirve también para comprobar que la API key funciona. Nunca lanza por un formato inesperado. */
export async function serviceVersion(service: ServiceKind): Promise<string> {
  switch (service) {
    case "radarr":
    case "sonarr":
      return str((await apiRequest<{ version?: unknown } | null>(service, { path: "/api/v3/system/status" }))?.version);
    case "prowlarr":
      return str((await apiRequest<{ version?: unknown } | null>(service, { path: "/api/v1/system/status" }))?.version);
    case "bazarr":
      return str(
        (await apiRequest<{ data?: { bazarr_version?: unknown } } | null>(service, { path: "/api/system/status" }))?.data?.bazarr_version,
      );
    case "qbittorrent":
      return str(await apiRequest<unknown>(service, { path: "/api/v2/app/version" }));
    case "tracearr":
      return str((await apiRequest<{ tracearr_version?: unknown } | null>(service, { path: "/api/v2/public/servers" }))?.tracearr_version);
    case "plex":
      return str((await apiRequest<{ MediaContainer?: { version?: unknown } } | null>(service, { path: "/" }))?.MediaContainer?.version);
  }
}
