import { useMemo } from "react";
import { radarr } from "@/api/radarr";
import { sonarr } from "@/api/sonarr";
import { mergeCalendar } from "@/api/calendar";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export function useCalendar(start: Date, end: Date) {
  const key = [start.toISOString(), end.toISOString()];
  const movies = useServiceQuery("radarr", ["calendar", ...key], () => radarr.getCalendar(start, end), {
    refetchInterval: REFRESH.library,
  });
  const episodes = useServiceQuery("sonarr", ["calendar", ...key], () => sonarr.getCalendar(start, end), {
    refetchInterval: REFRESH.library,
  });
  const items = useMemo(() => mergeCalendar(movies.data ?? [], episodes.data ?? []), [movies.data, episodes.data]);
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
