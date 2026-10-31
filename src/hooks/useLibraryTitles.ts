import { useMemo } from "react";
import type { ArrService } from "@/api/arr";
import { radarr } from "@/api/radarr";
import { sonarr } from "@/api/sonarr";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

/**
 * Títulos de la biblioteca por id (película o serie), para nombrar entradas que solo traen el id.
 * Comparte la caché con Películas/Series, así que normalmente no hace ninguna petición nueva.
 */
export function useLibraryTitles(service: ArrService): Map<number, string> {
  const movies = useServiceQuery("radarr", ["movies"], radarr.getMovies, {
    enabled: service === "radarr",
    staleTime: REFRESH.library,
  });
  const series = useServiceQuery("sonarr", ["series"], sonarr.getSeries, {
    enabled: service === "sonarr",
    staleTime: REFRESH.library,
  });
  const list = service === "radarr" ? movies.data : series.data;
  return useMemo(() => new Map((Array.isArray(list) ? list : []).map((x) => [x.id, x.title] as const)), [list]);
}
