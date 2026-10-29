import type { WantedKind } from "@/api/arr";
import { radarr } from "@/api/radarr";
import { sonarr } from "@/api/sonarr";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export const useMovies = () => useServiceQuery("radarr", ["movies"], radarr.getMovies, { refetchInterval: REFRESH.library });
export const useRadarrQueue = (enabled = true) =>
  useServiceQuery("radarr", ["queue"], radarr.getQueue, { refetchInterval: REFRESH.queue, enabled });
export const useRadarrWanted = (kind: WantedKind, enabled = true) =>
  useServiceQuery("radarr", ["wanted", kind], () => radarr.getWanted(kind), { refetchInterval: REFRESH.library, enabled });
export const useRadarrMeta = () => ({
  profiles: useServiceQuery("radarr", ["profiles"], radarr.getQualityProfiles, { staleTime: REFRESH.library }),
  roots: useServiceQuery("radarr", ["roots"], radarr.getRootFolders, { staleTime: REFRESH.library }),
});

export const useSeries = () => useServiceQuery("sonarr", ["series"], sonarr.getSeries, { refetchInterval: REFRESH.library });
export const useEpisodes = (seriesId: number | undefined) =>
  useServiceQuery("sonarr", ["episodes", seriesId], () => sonarr.getEpisodes(seriesId!), {
    enabled: seriesId != null,
    // Recién añadida, Sonarr tarda unos segundos en crear los episodios.
    refetchInterval: (q) => (q.state.data?.length ? false : 3000),
  });
export const useSonarrQueue = (enabled = true) =>
  useServiceQuery("sonarr", ["queue"], sonarr.getQueue, { refetchInterval: REFRESH.queue, enabled });
export const useSonarrWanted = (kind: WantedKind, enabled = true) =>
  useServiceQuery("sonarr", ["wanted", kind], () => sonarr.getWanted(kind), { refetchInterval: REFRESH.library, enabled });
export const useEpisodeFiles = (seriesId: number | undefined) =>
  useServiceQuery("sonarr", ["episodefiles", seriesId], () => sonarr.getEpisodeFiles(seriesId!), { enabled: seriesId != null });
export const useSonarrMeta = () => ({
  profiles: useServiceQuery("sonarr", ["profiles"], sonarr.getQualityProfiles, { staleTime: REFRESH.library }),
  roots: useServiceQuery("sonarr", ["roots"], sonarr.getRootFolders, { staleTime: REFRESH.library }),
});
