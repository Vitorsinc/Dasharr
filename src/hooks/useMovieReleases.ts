import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Movie } from "@/api/radarr";
import { tmdbHasKey, tmdbReleaseDates } from "@/api/tmdb";
import { mayHaveUpcoming, movieReleases, type MovieReleases } from "@/lib/releases";
import { usePrefs } from "./usePrefs";

export const tmdbKeyQuery = ["tmdb", "hasKey"] as const;

export function useTmdbHasKey() {
  return useQuery({ queryKey: tmdbKeyQuery, queryFn: async () => (await tmdbHasKey()) === true, staleTime: Infinity });
}

/** Fechas de estreno de las películas en el país elegido en Ajustes; sin clave de TMDB, las de Radarr. */
export function useMovieReleases(movies: Movie[] | undefined): (m: Movie) => MovieReleases {
  const [{ releaseCountry }] = usePrefs();
  const hasKey = useTmdbHasKey().data === true;
  const ids = useMemo(
    () => [...new Set((movies ?? []).filter((m) => m.tmdbId && mayHaveUpcoming(m)).map((m) => m.tmdbId))].sort((a, b) => a - b),
    [movies],
  );
  const { data } = useQuery({
    queryKey: ["tmdb", "releases", releaseCountry, ids],
    queryFn: async () => (await tmdbReleaseDates(ids, releaseCountry)) ?? {},
    enabled: hasKey && ids.length > 0,
    staleTime: 6 * 3600_000,
  });
  return useCallback((m: Movie) => movieReleases(m, data?.[m.tmdbId]), [data]);
}
