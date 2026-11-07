import { indexWatched, indexWatchedEpisodes, watchedMedia, type WatchedKind, type WatchedMedia } from "@/api/tracearr";
import { usePrefs } from "./usePrefs";
import { useServiceQuery } from "./useServiceQuery";

const FIVE_MIN = 5 * 60_000;

function useWatchedQuery<T>(kind: WatchedKind, build: (rows: WatchedMedia[]) => T, enabled = true) {
  const [{ watchUserId }] = usePrefs();
  const q = useServiceQuery("tracearr", ["watched", kind, watchUserId], async () => build(await watchedMedia(kind, watchUserId!)), {
    enabled: enabled && !!watchUserId,
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
    // Un Tracearr antiguo (sin /watched-media) no debe insistir: simplemente no se marca nada.
    retry: false,
  });
  return { q, data: watchUserId && q.configured === true ? q.data : undefined };
}

/** Películas que has visto o empezado (según Tracearr). `undefined` si no has elegido tu usuario. */
export const useMyWatchedMovies = () => useWatchedQuery("movie", indexWatched).data;

/** Series que has visto entera o empezado. */
export const useMyWatchedShows = () => useWatchedQuery("show", indexWatched).data;

/** Episodios que has visto, por serie. Solo se pide al abrir una ficha. */
export const useMyWatchedEpisodes = (enabled: boolean) => useWatchedQuery("episode", indexWatchedEpisodes, enabled).data;

/** Para Ajustes: si la consulta de películas falla (p. ej. Tracearr anterior a la 2.6). */
export const useMyWatchedCheck = () => useWatchedQuery("movie", indexWatched).q;
