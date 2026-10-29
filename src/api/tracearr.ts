import { apiRequest } from "@/lib/tauri";
import { isApiError } from "@/lib/types";

const BASE = "/api/v2/public";

export interface PlayUser {
  id: string;
  server_user_id: string;
  username: string | null;
  avatar_url: string | null;
}

/** Una reproducción de `GET /history` (una "cadena": pausas y reanudaciones cuentan como una sola). */
export interface Play {
  id: string;
  server_name: string;
  media_type: "movie" | "episode" | "track" | "live" | "photo" | "trailer" | "unknown";
  media_title: string;
  show_title: string | null;
  season_number: number | null;
  episode_number: number | null;
  year: number | null;
  poster_url: string | null;
  duration_ms: number | null;
  percent_complete: number | null;
  started_at: string;
  stopped_at: string | null;
  watched: boolean;
  device: string | null;
  player: string | null;
  product: string | null;
  platform: string | null;
  is_transcode: boolean | null;
  resolution?: string | null;
  tmdb_id: number | null;
  tvdb_id: number | null;
  imdb_id: string | null;
  user: PlayUser;
}

/** Reproducción en curso de `GET /streams`. */
export interface Stream {
  id: string;
  server_name: string;
  username: string;
  media_type: Play["media_type"];
  media_title: string;
  show_title: string | null;
  season_number: number | null;
  episode_number: number | null;
  year: number | null;
  poster_url: string | null;
  duration_ms: number | null;
  progress_ms: number;
  state: "playing" | "paused" | string;
  started_at: string;
  device: string | null;
  player: string | null;
  product: string | null;
  is_transcode: boolean | null;
}

export interface TracearrUser {
  id: string;
  username: string;
  identity_name: string | null;
}

interface CursorPage<T> {
  data: T[];
  meta?: { nextCursor: string | null; pageSize: number };
}

export interface HistoryFilter {
  userId?: string;
  mediaType?: "movie" | "episode";
  watched?: boolean;
}

/** Páginas que se leen como máximo para una ficha (100 reproducciones por página). */
const MAX_MEDIA_PAGES = 10;

export interface MediaHistory {
  plays: Play[];
  /** Tracearr no conoce el título por ninguno de sus IDs. */
  notFound: boolean;
  /** Había más reproducciones que las leídas. */
  truncated: boolean;
}

/** Referencias de Tracearr (`movie:tmdb:603`) en orden de preferencia; se prueba la siguiente si la anterior da 404. */
export function movieRefs(m: { tmdbId?: number; imdbId?: string }): string[] {
  const refs: string[] = [];
  if (m.tmdbId) refs.push(`movie:tmdb:${m.tmdbId}`);
  if (m.imdbId) refs.push(`movie:imdb:${m.imdbId}`);
  return refs;
}

export function showRefs(s: { tvdbId?: number; tmdbId?: number; imdbId?: string }): string[] {
  const refs: string[] = [];
  if (s.tvdbId) refs.push(`show:tvdb:${s.tvdbId}`);
  if (s.tmdbId) refs.push(`show:tmdb:${s.tmdbId}`);
  if (s.imdbId) refs.push(`show:imdb:${s.imdbId}`);
  return refs;
}

const is404 = (e: unknown) => isApiError(e) && e.kind === "Http" && e.status === 404;

export const playUserName = (u: PlayUser) => u.username ?? "?";

export const tracearr = {
  /** Historial de una película o serie (todas sus temporadas y episodios), de la reproducción más reciente a la más antigua. */
  async mediaHistory(refs: string[]): Promise<MediaHistory> {
    for (const ref of refs) {
      const plays: Play[] = [];
      let cursor: string | null | undefined;
      let pages = 0;
      try {
        do {
          const page = await apiRequest<CursorPage<Play>>("tracearr", {
            path: `${BASE}/media/${ref}/history`,
            query: { pageSize: 100, cursor: cursor ?? undefined },
          });
          plays.push(...(page.data ?? []));
          cursor = page.meta?.nextCursor;
          pages++;
        } while (cursor && pages < MAX_MEDIA_PAGES);
      } catch (e) {
        if (is404(e)) continue;
        throw e;
      }
      return { plays, notFound: false, truncated: !!cursor };
    }
    return { plays: [], notFound: true, truncated: false };
  },

  history: (filter: HistoryFilter, cursor?: string) =>
    apiRequest<CursorPage<Play>>("tracearr", {
      path: `${BASE}/history`,
      query: {
        pageSize: 50,
        cursor,
        user_id: filter.userId,
        media_type: filter.mediaType,
        watched: filter.watched ? "true" : undefined,
      },
    }),

  streams: async () => (await apiRequest<CursorPage<Stream>>("tracearr", { path: `${BASE}/streams` })).data ?? [],

  async users(): Promise<TracearrUser[]> {
    const all: TracearrUser[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await apiRequest<CursorPage<TracearrUser>>("tracearr", {
        path: `${BASE}/users`,
        query: { pageSize: 100, cursor: cursor ?? undefined },
      });
      all.push(...(page.data ?? []));
      cursor = page.meta?.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    return all.sort((a, b) => userLabel(a).localeCompare(userLabel(b), "es"));
  },
};

export const userLabel = (u: TracearrUser) => u.identity_name || u.username;

export interface Viewer {
  user: PlayUser;
  plays: Play[];
  last: string;
  watched: boolean;
  maxPercent: number;
}

/** Agrupa reproducciones por persona, de la vista más recientemente a la que menos. */
export function viewers(plays: Play[]): Viewer[] {
  const map = new Map<string, Viewer>();
  for (const p of plays) {
    const key = p.user.id ?? p.user.server_user_id;
    const v = map.get(key);
    if (!v) {
      map.set(key, { user: p.user, plays: [p], last: p.started_at, watched: p.watched, maxPercent: p.percent_complete ?? 0 });
      continue;
    }
    v.plays.push(p);
    if (p.started_at > v.last) v.last = p.started_at;
    v.watched ||= p.watched;
    v.maxPercent = Math.max(v.maxPercent, p.percent_complete ?? 0);
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export const episodeKey = (season: number | null | undefined, episode: number | null | undefined) => `${season ?? "?"}x${episode ?? "?"}`;

/** Reproducciones de una serie agrupadas por episodio (`"1x3"`). */
export function playsByEpisode(plays: Play[]): Map<string, Play[]> {
  const map = new Map<string, Play[]>();
  for (const p of plays) {
    if (p.media_type !== "episode") continue;
    const k = episodeKey(p.season_number, p.episode_number);
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return map;
}
