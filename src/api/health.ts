import type { HealthItem } from "./arr";
import { arrCommon } from "./arr";
import { prowlarr } from "./prowlarr";
import { bazarr } from "./bazarr";
import type { ServiceKind } from "@/lib/types";

/** Servicios que tienen una lista de avisos de salud (qBittorrent no la tiene). */
export type HealthService = Extract<ServiceKind, "radarr" | "sonarr" | "prowlarr" | "bazarr">;
export const HEALTH_SERVICES: HealthService[] = ["radarr", "sonarr", "prowlarr", "bazarr"];

const SHOWN = new Set(["notice", "warning", "error"]);

/** Avisos de un servicio sin los "ok": lo que el servicio enseña en System → Status. */
export async function getHealth(service: HealthService): Promise<HealthItem[]> {
  const list =
    service === "prowlarr"
      ? await prowlarr.getHealth()
      : service === "bazarr"
        ? await bazarr.getHealth()
        : await arrCommon(service).getHealth();
  return (Array.isArray(list) ? list : []).filter((h) => SHOWN.has(h.type) && !!h.message);
}
