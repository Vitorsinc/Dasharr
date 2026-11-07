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

/** Fila de `GET /watched-media`: un título visto (o empezado) por la persona elegida. */
export interface WatchedMedia {
  media_type: string;
  title: string;
  imdb_id: string | null;
  tmdb_id: number | null;
  tvdb_id: number | null;
  show_title: string | null;
  show_imdb_id: string | null;
  show_tmdb_id: number | null;
  show_tvdb_id: number | null;
  season_number: number | null;
  episode_number: number | null;
  watched_state: "watched" | "partial";
  plays: number;
  last_watched_day: string;
  episodes_watched: number | null;
  episode_count: number | null;
}

export type WatchedKind = "movie" | "show" | "episode";

/** Páginas de 1000 que se leen como máximo (las series con muchos episodios caben de sobra). */
const MAX_WATCHED_PAGES = 30;

/**
 * Todo lo que una persona ha visto o empezado, de un tipo. Lo que no ha visto nunca no aparece.
 * Necesita Tracearr 2.6 o superior.
 */
export async function watchedMedia(kind: WatchedKind, userId: string): Promise<WatchedMedia[]> {
  const all: WatchedMedia[] = [];
  let cursor: string | null | undefined;
  let pages = 0;
  do {
    const page = await apiRequest<CursorPage<WatchedMedia>>("tracearr", {
      path: `${BASE}/watched-media`,
      query: { media_type: kind, user_id: userId, min_state: "partial", pageSize: 1000, cursor: cursor ?? undefined },
    });
    all.push(...(page.data ?? []));
    cursor = page.meta?.nextCursor;
    pages++;
  } while (cursor && pages < MAX_WATCHED_PAGES);
  return all;
}

/** Estado de visto de un título para la persona elegida. */
export interface MyWatch {
  state: "watched" | "partial";
  plays: number;
  last: string;
  /** Solo series: episodios vistos y episodios que hay en el servidor. */
  episodesWatched?: number;
  episodeCount?: number;
}

export interface WatchedIndex {
  get(ids: { tmdbId?: number; tvdbId?: number; imdbId?: string }): MyWatch | undefined;
  size: number;
}

const idKeys = (ids: { tmdbId?: number | null; tvdbId?: number | null; imdbId?: string | null }) =>
  [ids.tvdbId && `tvdb:${ids.tvdbId}`, ids.tmdbId && `tmdb:${ids.tmdbId}`, ids.imdbId && `imdb:${ids.imdbId}`].filter(Boolean) as string[];

const toWatch = (r: WatchedMedia): MyWatch => ({
  state: r.watched_state,
  plays: r.plays,
  last: r.last_watched_day,
  episodesWatched: r.episodes_watched ?? undefined,
  episodeCount: r.episode_count ?? undefined,
});

/** Índice por TMDB/TVDB/IMDb para cruzarlo con Radarr o Sonarr. */
export function indexWatched(rows: WatchedMedia[]): WatchedIndex {
  const map = new Map<string, MyWatch>();
  for (const r of rows) {
    const w = toWatch(r);
    for (const k of idKeys({ tmdbId: r.tmdb_id, tvdbId: r.tvdb_id, imdbId: r.imdb_id })) if (!map.has(k)) map.set(k, w);
  }
  return {
    get: (ids) => {
      for (const k of idKeys(ids)) {
        const hit = map.get(k);
        if (hit) return hit;
      }
      return undefined;
    },
    size: rows.length,
  };
}

/** Episodios vistos de cada serie: clave de serie (`tvdb:81189`…) → `"1x3"` → estado. */
export interface EpisodeWatchIndex {
  forShow(ids: { tmdbId?: number; tvdbId?: number; imdbId?: string }): Map<string, MyWatch> | undefined;
}

export function indexWatchedEpisodes(rows: WatchedMedia[]): EpisodeWatchIndex {
  const byShow = new Map<string, Map<string, MyWatch>>();
  for (const r of rows) {
    if (r.season_number == null || r.episode_number == null) continue;
    // Todas las claves de la serie apuntan al mismo mapa, para no repartir episodios entre IDs.
    const keys = idKeys({ tmdbId: r.show_tmdb_id, tvdbId: r.show_tvdb_id, imdbId: r.show_imdb_id });
    if (!keys.length) continue;
    const eps = keys.map((k) => byShow.get(k)).find(Boolean) ?? new Map<string, MyWatch>();
    for (const k of keys) if (!byShow.has(k)) byShow.set(k, eps);
    const key = episodeKey(r.season_number, r.episode_number);
    const prev = eps.get(key);
    if (!prev || (prev.state === "partial" && r.watched_state === "watched")) eps.set(key, toWatch(r));
  }
  return {
    forShow: (ids) => {
      for (const k of idKeys(ids)) {
        const hit = byShow.get(k);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}
