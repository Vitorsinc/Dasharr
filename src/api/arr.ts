import { apiRequest, imageUrl } from "@/lib/tauri";
import type { ServiceKind } from "@/lib/types";

export interface ArrImage {
  coverType: string;
  url?: string;
  remoteUrl?: string;
}
export interface QualityProfile {
  id: number;
  name: string;
}
export interface RootFolder {
  id: number;
  path: string;
  freeSpace?: number;
}
export interface QueueRecord {
  id: number;
  title: string;
  size: number;
  sizeleft: number;
  status: string;
  trackedDownloadState?: string;
  timeleft?: string;
  estimatedCompletionTime?: string;
  downloadClient?: string;
  movie?: { title: string; year?: number };
  series?: { title: string };
  episode?: { seasonNumber: number; episodeNumber: number; title: string };
}

export type ArrService = Extract<ServiceKind, "radarr" | "sonarr">;

/** Póster: la URL pública (TMDB/TVDB) si existe; si no, la imagen local a través del protocolo autenticado. */
export function posterUrl(service: ArrService, item: { id?: number; images?: ArrImage[] }, size = 500): string | undefined {
  const img = item.images?.find((i) => i.coverType === "poster");
  if (img?.remoteUrl) return img.remoteUrl;
  if (item.id != null && img) return imageUrl(service, `/api/v3/mediacover/${item.id}/poster-${size}.jpg`);
  return undefined;
}

export function arrCommon(service: ArrService) {
  return {
    getQualityProfiles: () => apiRequest<QualityProfile[]>(service, { path: "/api/v3/qualityprofile" }),
    getRootFolders: () => apiRequest<RootFolder[]>(service, { path: "/api/v3/rootfolder" }),
    command: (body: Record<string, unknown>) => apiRequest<unknown>(service, { method: "POST", path: "/api/v3/command", json: body }),
    getQueue: async () =>
      (
        await apiRequest<{ records: QueueRecord[] }>(service, {
          path: "/api/v3/queue",
          query: {
            pageSize: 200,
            includeMovie: service === "radarr",
            includeSeries: service === "sonarr",
            includeEpisode: service === "sonarr",
          },
        })
      ).records ?? [],
  };
}

export function isoDate(d: Date) {
  return d.toISOString();
}

export interface Release {
  guid: string;
  title: string;
  indexer: string;
  indexerId: number;
  size: number;
  seeders?: number;
  leechers?: number;
  age?: number;
  ageHours?: number;
  publishDate?: string;
  protocol: "torrent" | "usenet";
  quality?: { quality?: { name?: string } };
  customFormatScore?: number;
  rejected?: boolean;
  rejections?: string[];
  languages?: { name: string }[];
  infoUrl?: string;
}

export type ReleaseQuery = { movieId: number } | { episodeId: number } | { seriesId: number; seasonNumber: number };

/** Búsqueda manual: pide al *arr que consulte sus indexadores ahora mismo para un elemento concreto. */
export function getReleases(service: ArrService, q: ReleaseQuery) {
  return apiRequest<Release[]>(service, { path: "/api/v3/release", query: q as Record<string, number> });
}

/** Descarga una release concreta elegida por el usuario, aunque el *arr la haya rechazado. */
export function grabRelease(service: ArrService, r: Pick<Release, "guid" | "indexerId">) {
  return apiRequest<unknown>(service, { method: "POST", path: "/api/v3/release", json: { guid: r.guid, indexerId: r.indexerId } });
}

export type ReleaseSort = "default" | "seeders" | "size" | "age" | "score";

export function sortReleases(list: Release[], by: ReleaseSort): Release[] {
  const out = [...list];
  switch (by) {
    case "seeders":
      return out.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
    case "size":
      return out.sort((a, b) => b.size - a.size);
    case "age":
      return out.sort((a, b) => (a.ageHours ?? a.age ?? 0) - (b.ageHours ?? b.age ?? 0));
    case "score":
      return out.sort((a, b) => (b.customFormatScore ?? 0) - (a.customFormatScore ?? 0));
    default:
      // Orden del *arr (ya prioriza calidad y puntuación), con las rechazadas al final.
      return out.sort((a, b) => Number(!!a.rejected) - Number(!!b.rejected));
  }
}
