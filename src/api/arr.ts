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
