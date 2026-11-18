import { beszel } from "@/api/beszel";
import { useServiceQuery } from "./useServiceQuery";

/** Equipos de Beszel con sus medidas: el agente manda datos cada minuto, así que basta con refrescar cada 30 s. */
export function useServerSystems() {
  return useServiceQuery("beszel", ["systems"], beszel.systems, { refetchInterval: 30_000 });
}
