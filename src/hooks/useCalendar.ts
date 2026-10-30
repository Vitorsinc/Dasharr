import { useMemo } from "react";
import { sonarr } from "@/api/sonarr";
import { mergeCalendar } from "@/api/calendar";
import { useMovies } from "./useArr";
import { useMovieReleases } from "./useMovieReleases";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export function useCalendar(start: Date, end: Date) {
  const key = [start.toISOString(), end.toISOString()];
  // Toda la biblioteca y no el calendario de Radarr: con las fechas del país elegido, una película puede
  // estrenarse en estas fechas aunque las de Radarr caigan fuera.
  const movies = useMovies();
  const monitored = useMemo(() => (movies.data ?? []).filter((m) => m.monitored), [movies.data]);
  const releasesOf = useMovieReleases(monitored);
  const episodes = useServiceQuery("sonarr", ["calendar", ...key], () => sonarr.getCalendar(start, end), {
    refetchInterval: REFRESH.library,
  });
  const items = useMemo(
    () => mergeCalendar(monitored, episodes.data ?? [], { releasesOf, start, end }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitored, episodes.data, releasesOf, start.getTime(), end.getTime()],
  );
  return {
    items,
    isLoading: movies.isLoading || episodes.isLoading,
    errors: [
      movies.isError && { service: "radarr" as const, error: movies.error },
      episodes.isError && { service: "sonarr" as const, error: episodes.error },
    ].filter(Boolean) as {
      service: "radarr" | "sonarr";
      error: unknown;
    }[],
    noneConfigured: movies.configured === false && episodes.configured === false,
    refetch: () => {
      movies.refetch();
      episodes.refetch();
    },
  };
}
