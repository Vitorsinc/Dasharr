import { apiRequest } from "@/lib/tauri";
import type { ServiceKind } from "@/lib/types";

/** Versión del servicio; sirve también para comprobar que la API key funciona. */
export async function serviceVersion(service: ServiceKind): Promise<string> {
  switch (service) {
    case "radarr":
    case "sonarr":
      return (await apiRequest<{ version: string }>(service, { path: "/api/v3/system/status" })).version;
    case "prowlarr":
      return (await apiRequest<{ version: string }>(service, { path: "/api/v1/system/status" })).version;
    case "bazarr":
      return (await apiRequest<{ data: { bazarr_version: string } }>(service, { path: "/api/system/status" })).data.bazarr_version;
    case "qbittorrent":
      return await apiRequest<string>(service, { path: "/api/v2/app/version" });
  }
}
