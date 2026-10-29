import { apiRequest, imageUrl } from "@/lib/tauri";

/** Elemento de la biblioteca o de una sesión (`Metadata` de Plex). Solo los campos que usa Dasharr. */
export interface PlexItem {
  ratingKey: string;
  key?: string;
  type: "movie" | "show" | "season" | "episode" | "track" | "album" | "artist" | "photo" | "clip" | string;
  title: string;
  year?: number;
  /** Serie del episodio; serie de la temporada en `parentTitle`. */
  grandparentTitle?: string;
  parentTitle?: string;
  parentIndex?: number;
  index?: number;
  thumb?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  addedAt?: number;
  duration?: number;
  viewOffset?: number;
  viewCount?: number;
  leafCount?: number;
  viewedLeafCount?: number;
  guid?: string;
  Guid?: { id: string }[];
  librarySectionID?: number | string;
}

export interface PlexSession extends PlexItem {
  sessionKey?: string;
  User?: { id?: string; title?: string; thumb?: string };
  Player?: { title?: string; product?: string; platform?: string; state?: string; local?: boolean };
  Session?: { id?: string; bandwidth?: number; location?: "lan" | "wan" | string };
  TranscodeSession?: { videoDecision?: string; audioDecision?: string; progress?: number; throttled?: boolean };
  Media?: { videoResolution?: string; bitrate?: number }[];
}

export interface PlexSection {
  key: string;
  title: string;
  type: "movie" | "show" | "artist" | "photo" | string;
  refreshing?: boolean;
  scannedAt?: number;
}

export interface PlexServerInfo {
  friendlyName?: string;
  version?: string;
  machineIdentifier?: string;
  platform?: string;
  myPlexSubscription?: boolean;
}

export interface PlexActivity {
  uuid: string;
  type: string;
  title?: string;
  subtitle?: string;
  progress?: number;
}

export interface PlexUpdate {
  version?: string;
  state?: string;
  downloadURL?: string;
}

export interface PlexResources {
  hostCpuUtilization?: number;
  processCpuUtilization?: number;
  hostMemoryUtilization?: number;
  processMemoryUtilization?: number;
}

type Container<T> = { MediaContainer?: T } | null;
const LIBRARY = "com.plexapp.plugins.library";

async function container<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  return ((await apiRequest<Container<T>>("plex", { path, query }))?.MediaContainer ?? {}) as T;
}

const metadata = async <T = PlexItem>(path: string, query?: Record<string, string | number>) =>
  (await container<{ Metadata?: T[] }>(path, query)).Metadata ?? [];

export const plex = {
  server: () => container<PlexServerInfo>("/"),
  sessions: () => metadata<PlexSession>("/status/sessions"),
  /** Corta una reproducción. Plex solo lo permite con Plex Pass. */
  terminate: (sessionId: string, reason: string) =>
    apiRequest<unknown>("plex", { path: "/status/sessions/terminate", query: { sessionId, reason } }),
  recentlyAdded: (size = 20) =>
    metadata("/library/recentlyAdded", { "X-Plex-Container-Start": 0, "X-Plex-Container-Size": size }),
  sections: async () => (await container<{ Directory?: PlexSection[] }>("/library/sections")).Directory ?? [],
  /** Todo el contenido de una biblioteca con sus identificadores externos (TMDB, TVDB, IMDb). */
  sectionItems: (key: string) => metadata(`/library/sections/${key}/all`, { includeGuids: 1 }),
  scanSection: (key: string) => apiRequest<unknown>("plex", { path: `/library/sections/${key}/refresh` }),
  scanAll: () => apiRequest<unknown>("plex", { path: "/library/sections/all/refresh" }),
  emptyTrash: (key: string) => apiRequest<unknown>("plex", { method: "PUT", path: `/library/sections/${key}/emptyTrash` }),
  refreshItem: (ratingKey: string) => apiRequest<unknown>("plex", { method: "PUT", path: `/library/metadata/${ratingKey}/refresh` }),
  setWatched: (ratingKey: string, watched: boolean) =>
    apiRequest<unknown>("plex", { path: watched ? "/:/scrobble" : "/:/unscrobble", query: { identifier: LIBRARY, key: ratingKey } }),
  cleanBundles: () => apiRequest<unknown>("plex", { method: "PUT", path: "/library/clean/bundles" }),
  optimize: () => apiRequest<unknown>("plex", { method: "PUT", path: "/library/optimize", query: { async: 1 } }),
  activities: async () => (await container<{ Activity?: PlexActivity[] }>("/activities")).Activity ?? [],
  update: async (): Promise<PlexUpdate | null> => {
    const c = await container<{ Release?: PlexUpdate[] }>("/updater/status");
    return c.Release?.[0] ?? null;
  },
  resources: async (): Promise<PlexResources | null> => {
    const c = await container<{ StatisticsResources?: PlexResources[] }>("/statistics/resources", { timespan: 6 });
    return c.StatisticsResources?.at(-1) ?? null;
  },
};

/** Carátula reducida por el propio Plex (`/photo/:/transcode`), cargada con el token. */
export function plexImage(path: string | undefined, width = 300, height = 450): string | undefined {
  if (!path) return undefined;
  const query = new URLSearchParams({ url: path, width: String(width), height: String(height), minSize: "1", upscale: "1" });
  return imageUrl("plex", `/photo/:/transcode?${query}`);
}

/** Póster adecuado: el de la serie para episodios y temporadas. */
export function plexPoster(item: PlexItem): string | undefined {
  if (item.type === "episode") return plexImage(item.grandparentThumb ?? item.parentThumb ?? item.thumb);
  if (item.type === "season") return plexImage(item.thumb ?? item.parentThumb);
  return plexImage(item.thumb);
}

const pad = (n?: number) => String(n ?? 0).padStart(2, "0");

/** Título y subtítulo legibles de un elemento. */
export function plexTitle(item: PlexItem): { title: string; subtitle?: string } {
  switch (item.type) {
    case "episode":
      return { title: item.grandparentTitle ?? item.title, subtitle: `T${pad(item.parentIndex)}E${pad(item.index)} · ${item.title}` };
    case "season":
      return { title: item.parentTitle ?? item.title, subtitle: item.title };
    default:
      return { title: item.title, subtitle: item.year ? String(item.year) : undefined };
  }
}

/** Enlace a la ficha en Plex Web (abre la app del navegador y elige el servidor). */
export function plexWebUrl(machineIdentifier: string, ratingKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`;
}

/** Identificadores externos de un elemento: `tmdb://603`, `imdb://tt0133093`, `tvdb://81189`. */
export function plexGuids(item: PlexItem): string[] {
  const out = (item.Guid ?? []).map((g) => g.id);
  // Agentes antiguos: com.plexapp.agents.imdb://tt0133093?lang=es
  const legacy = item.guid?.match(/^com\.plexapp\.agents\.(imdb|themoviedb|thetvdb):\/\/([^?/]+)/);
  if (legacy) {
    const scheme = { imdb: "imdb", themoviedb: "tmdb", thetvdb: "tvdb" }[legacy[1] as "imdb" | "themoviedb" | "thetvdb"];
    out.push(`${scheme}://${legacy[2]}`);
  }
  return out;
}

export interface PlexIndex {
  machineIdentifier?: string;
  byGuid: Map<string, PlexItem>;
  /** Bibliotecas por tipo, para escanear la que toca. */
  sections: PlexSection[];
}

/** Índice de películas y series de Plex por identificador externo, para saber si algo de Radarr/Sonarr ya está en Plex. */
export async function buildPlexIndex(): Promise<PlexIndex> {
  const [server, sections] = await Promise.all([plex.server(), plex.sections()]);
  const media = sections.filter((s) => s.type === "movie" || s.type === "show");
  const lists = await Promise.all(media.map((s) => plex.sectionItems(s.key)));
  const byGuid = new Map<string, PlexItem>();
  // Con el tipo delante: el mismo número de TMDB puede ser una película y una serie distintas.
  for (const item of lists.flat()) for (const g of plexGuids(item)) byGuid.set(`${item.type}:${g}`, item);
  return { machineIdentifier: server.machineIdentifier, byGuid, sections: media };
}

export interface ExternalIds {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}

export function findInPlex(index: PlexIndex | undefined, ids: ExternalIds, type: "movie" | "show"): PlexItem | undefined {
  if (!index) return undefined;
  const keys = [ids.tmdbId && `tmdb://${ids.tmdbId}`, ids.tvdbId && `tvdb://${ids.tvdbId}`, ids.imdbId && `imdb://${ids.imdbId}`];
  for (const k of keys) {
    const hit = k ? index.byGuid.get(`${type}:${k}`) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** Visto del todo: películas con alguna reproducción completa, series con todos los episodios vistos. */
export function isWatched(item: PlexItem): boolean {
  if (item.type === "show") return !!item.leafCount && item.viewedLeafCount === item.leafCount;
  return (item.viewCount ?? 0) > 0;
}

/** Sesiones nuevas respecto a la consulta anterior (para avisar cuando alguien empieza a ver algo). */
export function newSessions(prev: PlexSession[] | undefined, next: PlexSession[]): PlexSession[] {
  if (!prev) return [];
  const seen = new Set(prev.map((s) => s.Session?.id ?? s.sessionKey));
  return next.filter((s) => !seen.has(s.Session?.id ?? s.sessionKey));
}

/** El usuario 1 es el dueño del servidor: no se avisa de lo que ve uno mismo. */
export const isOwner = (s: PlexSession) => String(s.User?.id) === "1";

export function isTranscoding(s: PlexSession): boolean {
  const tc = s.TranscodeSession;
  return !!tc && (tc.videoDecision === "transcode" || tc.audioDecision === "transcode");
}
