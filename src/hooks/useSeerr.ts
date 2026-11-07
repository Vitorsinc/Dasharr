import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { seerr, seerrReason, type DiscoverKind, type MovieDetails, type TvDetails, type IssueFilter, type MediaType, type RequestFilter } from "@/api/seerr";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export const SEERR_PAGE = 20;

export function useSeerrRequests(o: { filter: RequestFilter; page: number; mediaType: MediaType | "all"; sort: "added" | "modified"; requestedBy?: number }) {
  return useServiceQuery(
    "seerr",
    ["requests", o.filter, o.page, o.mediaType, o.sort, o.requestedBy ?? null],
    () => seerr.requests({ ...o, take: SEERR_PAGE, skip: (o.page - 1) * SEERR_PAGE }),
    { refetchInterval: REFRESH.queue, keepPrevious: true },
  );
}

export const useSeerrCounts = () => useServiceQuery("seerr", ["counts"], seerr.counts, { refetchInterval: REFRESH.queue });

/** Ficha de TMDB (título, póster, temporadas) de una solicitud o resultado. Se guarda un buen rato. */
export function useSeerrMedia(type: MediaType, tmdbId: number | undefined) {
  return useServiceQuery(
    "seerr",
    ["media", type, tmdbId],
    (): Promise<MovieDetails | TvDetails> => (type === "movie" ? seerr.movie(tmdbId!) : seerr.tv(tmdbId!)),
    { enabled: !!tmdbId, staleTime: REFRESH.library },
  );
}

export function useSeerrSearch(query: string, page = 1) {
  return useServiceQuery("seerr", ["search", query, page], () => seerr.search(query, page), {
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    keepPrevious: true,
  });
}

export function useSeerrDiscover(kind: DiscoverKind, page = 1) {
  return useServiceQuery("seerr", ["discover", kind, page], () => seerr.discover(kind, page), { staleTime: REFRESH.library });
}

export const useSeerrServers = (type: MediaType) =>
  useServiceQuery("seerr", ["servers", type], () => seerr.servers(type), { staleTime: REFRESH.library });

export const useSeerrServerDetails = (type: MediaType, id: number | undefined) =>
  useServiceQuery("seerr", ["servers", type, id], () => seerr.serverDetails(type, id!), {
    enabled: id !== undefined,
    staleTime: REFRESH.library,
  });

export const useSeerrUsers = () => useServiceQuery("seerr", ["users"], () => seerr.users(), { staleTime: REFRESH.status });
export const useSeerrMe = () => useServiceQuery("seerr", ["me"], seerr.me, { staleTime: REFRESH.library });
export const useSeerrQuota = (userId: number) =>
  useServiceQuery("seerr", ["quota", userId], () => seerr.quota(userId), { staleTime: REFRESH.status });

export function useSeerrIssues(filter: IssueFilter, page: number) {
  return useServiceQuery(
    "seerr",
    ["issues", filter, page],
    () => seerr.issues({ filter, take: SEERR_PAGE, skip: (page - 1) * SEERR_PAGE }),
    { refetchInterval: REFRESH.status, keepPrevious: true },
  );
}

/** Ejecuta un cambio en Seerr: avisa con el motivo que dé Seerr si falla y refresca sus consultas. */
export function useSeerrRun() {
  const qc = useQueryClient();
  return useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      try {
        await fn();
        if (ok) toast.success(ok);
        await qc.invalidateQueries({ queryKey: ["seerr"] });
        return true;
      } catch (e) {
        toast.error(seerrReason(e) ?? errorMessage(e, "seerr"));
        return false;
      }
    },
    [qc],
  );
}
