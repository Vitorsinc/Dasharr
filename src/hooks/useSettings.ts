import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/tauri";
import type { ServiceKind } from "@/lib/types";

export const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: getSettings, staleTime: Infinity });
}

/** true si el servicio tiene alguna dirección configurada. Mientras carga devuelve undefined. */
export function useIsConfigured(service: ServiceKind): boolean | undefined {
  const { data } = useSettings();
  if (!data) return undefined;
  const c = data[service]?.config;
  return !!c && c.enabled && !!(c.localUrl?.trim() || c.externalUrl?.trim());
}
