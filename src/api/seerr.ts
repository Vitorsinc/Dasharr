import { apiRequest } from "@/lib/tauri";
import { isApiError } from "@/lib/types";

const BASE = "/api/v1";
const get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
  apiRequest<T>("seerr", { path: `${BASE}${path}`, query });
const post = <T>(path: string, json?: unknown) => apiRequest<T>("seerr", { method: "POST", path: `${BASE}${path}`, json: json ?? {} });

/** Estado de una solicitud (`MediaRequestStatus`). */
export const RequestStatus = { Pending: 1, Approved: 2, Declined: 3, Failed: 4, Completed: 5 } as const;
/** Disponibilidad del contenido en el servidor (`MediaStatus`). */
export const MediaStatus = {
  Unknown: 1,
  Pending: 2,
  Processing: 3,
  PartiallyAvailable: 4,
  Available: 5,
  Blocklisted: 6,
  Deleted: 7,
} as const;
/** Tipo de incidencia (`IssueType`) y su estado (`IssueStatus`). */
export const IssueType = { Video: 1, Audio: 2, Subtitles: 3, Other: 4 } as const;
export const IssueStatus = { Open: 1, Resolved: 2 } as const;

export type MediaType = "movie" | "tv";

export interface SeerrUser {
  id: number;
  displayName?: string;
  username?: string | null;
  plexUsername?: string | null;
  jellyfinUsername?: string | null;
  email?: string;
  avatar?: string | null;
  requestCount?: number;
  permissions?: number;
  movieQuotaLimit?: number | null;
  movieQuotaDays?: number | null;
  tvQuotaLimit?: number | null;
  tvQuotaDays?: number | null;
  createdAt?: string;
}

export interface SeasonStatus {
  id?: number;
  seasonNumber: number;
  status: number;
}

export interface MediaInfo {
  id: number;
  tmdbId: number;
  tvdbId?: number | null;
  mediaType?: MediaType;
  status: number;
  status4k?: number;
  seasons?: SeasonStatus[];
  requests?: MediaRequest[];
}

export interface MediaRequest {
  id: number;
  status: number;
  type: MediaType;
  is4k: boolean;
  createdAt: string;
  updatedAt: string;
  media: MediaInfo;
  seasons?: SeasonStatus[];
  requestedBy?: SeerrUser;
  modifiedBy?: SeerrUser | null;
  profileName?: string | null;
}

export interface PageInfo {
  page: number;
  pages: number;
  pageSize?: number;
  results: number;
}

export interface Paged<T> {
  pageInfo: PageInfo;
  results: T[];
}

export interface RequestCounts {
  total: number;
  movie: number;
  tv: number;
  pending: number;
  approved: number;
  declined: number;
  processing: number;
  available: number;
  completed?: number;
}

/** Resultado de búsqueda o de Descubrir (películas y series; las personas se descartan). */
export interface SearchResult {
  id: number;
  mediaType: MediaType | "person";
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  voteAverage?: number;
  mediaInfo?: MediaInfo | null;
}

export interface TmdbPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SearchResult[];
}

export interface TvSeason {
  id: number;
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate?: string | null;
}

export interface MovieDetails {
  id: number;
  title: string;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  runtime?: number;
  voteAverage?: number;
  mediaInfo?: MediaInfo | null;
}

export interface TvDetails {
  id: number;
  name: string;
  firstAirDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  numberOfSeasons?: number;
  voteAverage?: number;
  seasons: TvSeason[];
  externalIds?: { tvdbId?: number | null };
  mediaInfo?: MediaInfo | null;
}

export interface QuotaPart {
  days?: number;
  limit?: number;
  used: number;
  remaining?: number;
  restricted: boolean;
}

export interface Quota {
  movie: QuotaPart;
  tv: QuotaPart;
}

export interface ServiceServer {
  id: number;
  name: string;
  is4k: boolean;
  isDefault: boolean;
  activeDirectory: string;
  activeProfileId: number;
}

export interface ServiceDetails {
  server: ServiceServer;
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string; freeSpace?: number }[];
}

export interface IssueComment {
  id: number;
  message: string;
  createdAt?: string;
  user?: SeerrUser;
}

export interface Issue {
  id: number;
  issueType: number;
  status: number;
  problemSeason?: number;
  problemEpisode?: number;
  createdAt: string;
  updatedAt?: string;
  media: MediaInfo;
  createdBy?: SeerrUser;
  comments?: IssueComment[];
}

export type RequestFilter = "all" | "pending" | "approved" | "processing" | "available" | "unavailable" | "failed" | "deleted" | "completed";
export type IssueFilter = "open" | "resolved" | "all";
export type DiscoverKind = "trending" | "movies" | "tv" | "upcomingMovies" | "upcomingTv";

const discoverPath: Record<DiscoverKind, string> = {
  trending: "/discover/trending",
  movies: "/discover/movies",
  tv: "/discover/tv",
  upcomingMovies: "/discover/movies/upcoming",
  upcomingTv: "/discover/tv/upcoming",
};

/** Lo que se envía para crear una solicitud. `seasons` solo para series. */
export interface NewRequest {
  mediaType: MediaType;
  mediaId: number;
  tvdbId?: number;
  seasons?: number[] | "all";
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  userId?: number;
}

const LANG = "es";

export const seerr = {
  requests: (o: { filter?: RequestFilter; take?: number; skip?: number; sort?: "added" | "modified"; mediaType?: MediaType | "all"; requestedBy?: number }) =>
    get<Paged<MediaRequest>>("/request", {
      take: o.take ?? 20,
      skip: o.skip ?? 0,
      filter: o.filter ?? "all",
      sort: o.sort ?? "added",
      mediaType: o.mediaType && o.mediaType !== "all" ? o.mediaType : undefined,
      requestedBy: o.requestedBy,
    }),
  counts: () => get<RequestCounts>("/request/count"),
  approve: (id: number) => post<MediaRequest>(`/request/${id}/approve`),
  decline: (id: number) => post<MediaRequest>(`/request/${id}/decline`),
  retry: (id: number) => post<MediaRequest>(`/request/${id}/retry`),
  deleteRequest: (id: number) => apiRequest<unknown>("seerr", { method: "DELETE", path: `${BASE}/request/${id}` }),
  create: (r: NewRequest) => post<MediaRequest>("/request", r),

  movie: (tmdbId: number) => get<MovieDetails>(`/movie/${tmdbId}`, { language: LANG }),
  tv: (tmdbId: number) => get<TvDetails>(`/tv/${tmdbId}`, { language: LANG }),

  search: (query: string, page = 1) => get<TmdbPage>("/search", { query, page, language: LANG }),
  discover: (kind: DiscoverKind, page = 1) => get<TmdbPage>(discoverPath[kind], { page, language: LANG }),

  servers: (type: MediaType) => get<ServiceServer[]>(type === "movie" ? "/service/radarr" : "/service/sonarr"),
  serverDetails: (type: MediaType, id: number) => get<ServiceDetails>(`/service/${type === "movie" ? "radarr" : "sonarr"}/${id}`),

  users: (take = 100, skip = 0) => get<Paged<SeerrUser>>("/user", { take, skip, sort: "requests" }),
  me: () => get<SeerrUser>("/auth/me"),
  quota: (userId: number) => get<Quota>(`/user/${userId}/quota`),

  issues: (o: { filter?: IssueFilter; take?: number; skip?: number }) =>
    get<Paged<Issue>>("/issue", { take: o.take ?? 20, skip: o.skip ?? 0, filter: o.filter ?? "open", sort: "added" }),
  setIssueStatus: (id: number, status: "resolved" | "open") => post<Issue>(`/issue/${id}/${status}`),
  commentIssue: (id: number, message: string) => post<Issue>(`/issue/${id}/comment`, { message }),
  deleteIssue: (id: number) => apiRequest<unknown>("seerr", { method: "DELETE", path: `${BASE}/issue/${id}` }),
};

/** Póster de TMDB (Seerr devuelve solo la ruta). */
export function tmdbImage(path: string | null | undefined, size: "w185" | "w342" | "w780" = "w342"): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

export const titleOf = (r: { title?: string; name?: string }) => r.title ?? r.name ?? "";
export const yearOf = (r: { releaseDate?: string; firstAirDate?: string }) => (r.releaseDate ?? r.firstAirDate ?? "").slice(0, 4);
export const userName = (u?: SeerrUser | null) => u?.displayName || u?.username || u?.plexUsername || u?.jellyfinUsername || u?.email || "?";

/** Motivo que da Seerr en el cuerpo (`{"message": "…"}`) de un error, si lo hay. */
export function seerrReason(e: unknown): string | undefined {
  if (!isApiError(e) || e.kind !== "Http" || !e.message) return undefined;
  const m = e.message.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  return m?.[1].replace(/\\"/g, '"');
}

/**
 * Temporadas que aún se pueden pedir: las que no están disponibles ni pedidas (salvo rechazadas).
 * La temporada 0 (especiales) no se ofrece, igual que en Seerr.
 */
export function requestableSeasons(tv: TvDetails, is4k = false): { season: TvSeason; state: "free" | "requested" | "available" | "partial" }[] {
  const media = tv.mediaInfo;
  const fromMedia = new Map((media?.seasons ?? []).map((s) => [s.seasonNumber, s.status]));
  const requested = new Set(
    (media?.requests ?? [])
      .filter((r) => r.is4k === is4k && r.status !== RequestStatus.Declined && r.status !== RequestStatus.Completed)
      .flatMap((r) => (r.seasons ?? []).map((s) => s.seasonNumber)),
  );
  return tv.seasons
    .filter((s) => s.seasonNumber > 0)
    .map((season) => {
      const st = fromMedia.get(season.seasonNumber);
      const state =
        st === MediaStatus.Available
          ? "available"
          : st === MediaStatus.PartiallyAvailable
            ? "partial"
            : requested.has(season.seasonNumber) || st === MediaStatus.Pending || st === MediaStatus.Processing
              ? "requested"
              : "free";
      return { season, state } as const;
    });
}
