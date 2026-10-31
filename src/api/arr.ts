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
  downloadId?: string;
  trackedDownloadStatus?: "ok" | "warning" | "error";
  statusMessages?: { title?: string; messages?: string[] }[];
  errorMessage?: string;
  movie?: { title: string; year?: number };
  seriesId?: number;
  series?: { title: string };
  episode?: { seasonNumber: number; episodeNumber: number; title: string };
}

export type ArrService = Extract<ServiceKind, "radarr" | "sonarr">;

export interface CommandStatus {
  id: number;
  name?: string;
  status: "queued" | "started" | "completed" | "failed" | "aborted" | "cancelled" | "orphaned";
  result?: "unknown" | "successful" | "unsuccessful";
  message?: string;
}

const FINISHED = new Set(["completed", "failed", "aborted", "cancelled", "orphaned"]);

/** Los comandos del *arr son asíncronos: consulta `command/{id}` hasta que termina (o se agota el tiempo). */
export async function waitForCommand(service: ArrService, id: number, { intervalMs = 2000, timeoutMs = 10 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = await apiRequest<CommandStatus>(service, { path: `/api/v3/command/${id}` });
    if (FINISHED.has(c.status) || Date.now() > deadline) return c;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function commandSucceeded(c: CommandStatus) {
  return c.status === "completed" && c.result !== "unsuccessful";
}

/** Imagen de un tipo (póster, fanart…): la URL pública (TMDB/TVDB) si existe; si no, la local a través del protocolo autenticado. */
export function coverUrl(
  service: ArrService,
  item: { id?: number; images?: ArrImage[] },
  coverType: "poster" | "fanart",
  size: number,
): string | undefined {
  const img = item.images?.find((i) => i.coverType === coverType);
  if (img?.remoteUrl) return img.remoteUrl;
  if (item.id != null && img) return imageUrl(service, `/api/v3/mediacover/${item.id}/${coverType}-${size}.jpg`);
  return undefined;
}

export function posterUrl(service: ArrService, item: { id?: number; images?: ArrImage[] }, size = 500): string | undefined {
  return coverUrl(service, item, "poster", size);
}

/** Fondo horizontal: el fanart si lo hay; si no, el póster. */
export function backdropUrl(service: ArrService, item: { id?: number; images?: ArrImage[] }): string | undefined {
  return coverUrl(service, item, "fanart", 360) ?? posterUrl(service, item, 250);
}

export interface Paged<T> {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: T[];
}

/** "missing" = monitorizado sin archivo; "cutoff" = tiene archivo pero no llega a la calidad objetivo del perfil. */
export type WantedKind = "missing" | "cutoff";

/** Máximo que pide Dasharr de una vez a las listas paginadas (buscadas, historial). */
export const PAGE_MAX = 2000;

export interface HistoryRecord {
  id: number;
  eventType: string;
  date: string;
  sourceTitle: string;
  quality?: { quality?: { name?: string } };
  data?: Record<string, string | undefined>;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  episode?: { seasonNumber: number; episodeNumber: number; title: string };
  /** Solo en el historial global, con `includeMovie` / `includeSeries`. */
  movie?: { id: number; title: string; year?: number };
  series?: { id: number; title: string };
}

/** Cambios en lote (`PUT /movie/editor`, `/series/editor`): solo se aplica lo que viene definido. */
export interface BulkEdit {
  monitored?: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
  /** Con carpeta raíz nueva: si el *arr mueve los archivos o solo cambia la ruta. */
  moveFiles?: boolean;
  tags?: number[];
  applyTags?: "add" | "remove" | "replace";
}

export interface DeleteOptions {
  deleteFiles: boolean;
  /** Añadir a las exclusiones de las listas de importación para que no se vuelva a añadir sola. */
  addExclusion: boolean;
}

export interface HealthItem {
  source: string;
  type: "ok" | "notice" | "warning" | "error";
  message: string;
  wikiUrl?: string;
}

/** Carpeta nueva de un elemento al cambiar de carpeta raíz: misma subcarpeta dentro de la raíz nueva. */
export function movePath(currentPath: string, newRoot: string) {
  const name =
    currentPath
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? "";
  const sep = newRoot.includes("\\") && !newRoot.includes("/") ? "\\" : "/";
  return `${newRoot.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export function arrCommon(service: ArrService) {
  return {
    getHealth: () => apiRequest<HealthItem[]>(service, { path: "/api/v3/health" }),
    getWanted: <T>(kind: WantedKind) =>
      apiRequest<Paged<T>>(service, {
        path: `/api/v3/wanted/${kind}`,
        query: {
          page: 1,
          pageSize: PAGE_MAX,
          monitored: true,
          ...(service === "sonarr"
            ? { includeSeries: true, includeEpisodeFile: true, sortKey: "episodes.airDateUtc", sortDirection: "descending" }
            : {}),
        },
      }),
    getQualityProfiles: () => apiRequest<QualityProfile[]>(service, { path: "/api/v3/qualityprofile" }),
    getRootFolders: () => apiRequest<RootFolder[]>(service, { path: "/api/v3/rootfolder" }),
    command: (body: Record<string, unknown>) => apiRequest<unknown>(service, { method: "POST", path: "/api/v3/command", json: body }),
    /** Quita un elemento de la cola. `blocklist` evita que el *arr vuelva a bajar esa release. */
    removeFromQueue: (id: number, o: { removeFromClient: boolean; blocklist: boolean }) =>
      apiRequest<unknown>(service, {
        method: "DELETE",
        path: `/api/v3/queue/${id}`,
        query: { removeFromClient: o.removeFromClient, blocklist: o.blocklist, skipRedownload: false },
      }),
    /** Descarga ya un elemento retrasado por el perfil de retraso. */
    grabQueueItem: (id: number) => apiRequest<unknown>(service, { method: "POST", path: `/api/v3/queue/grab/${id}` }),
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
  /** Peso de la calidad según el perfil; lo usan los *arr para ordenar por calidad. */
  qualityWeight?: number;
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

export type ReleaseSortKey = "default" | "title" | "indexer" | "quality" | "size" | "seeders" | "age" | "score";
export type SortDir = "asc" | "desc";
export interface ReleaseSort {
  key: ReleaseSortKey;
  dir: SortDir;
}

const RELEASE_SORT_KEYS: readonly string[] = ["default", "title", "indexer", "quality", "size", "seeders", "age", "score"];
export function isReleaseSort(v: unknown): v is ReleaseSort {
  const s = v as ReleaseSort | null;
  return !!s && typeof s === "object" && RELEASE_SORT_KEYS.includes(s.key) && (s.dir === "asc" || s.dir === "desc");
}

/** Sentido con el que empieza cada columna al pulsarla, como en Radarr/Sonarr. */
export const releaseSortDefaultDir: Record<ReleaseSortKey, SortDir> = {
  default: "asc",
  title: "asc",
  indexer: "asc",
  quality: "desc",
  size: "desc",
  seeders: "desc",
  age: "asc",
  score: "desc",
};

const ageOf = (r: Release) => r.ageHours ?? (r.age != null ? r.age * 24 : Number.MAX_SAFE_INTEGER);
const releaseValue: Record<Exclude<ReleaseSortKey, "default">, (r: Release) => number | string> = {
  title: (r) => r.title.toLowerCase(),
  indexer: (r) => r.indexer.toLowerCase(),
  quality: (r) => r.qualityWeight ?? 0,
  size: (r) => r.size,
  seeders: (r) => r.seeders ?? -1,
  age: ageOf,
  score: (r) => r.customFormatScore ?? 0,
};

export function sortReleases(list: Release[], sort: ReleaseSort): Release[] {
  const out = [...list];
  if (sort.key === "default") {
    // Orden del *arr (ya prioriza calidad y puntuación), con las rechazadas al final.
    return out.sort((a, b) => Number(!!a.rejected) - Number(!!b.rejected));
  }
  const value = releaseValue[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return sign * (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number));
  });
}

/**
 * Filtro por palabras sobre el título y el indexador: todas las palabras deben aparecer
 * y las que empiezan por «-» excluyen (p. ej. `1080p x265 -hdr`).
 */
export function filterReleases(list: Release[], text: string): Release[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && w !== "-");
  if (!words.length) return list;
  return list.filter((r) => {
    const hay = `${r.title} ${r.indexer}`.toLowerCase();
    return words.every((w) => (w.startsWith("-") ? !hay.includes(w.slice(1)) : hay.includes(w)));
  });
}

export interface ManualImportItem {
  id: number;
  path: string;
  relativePath?: string;
  folderName?: string;
  name?: string;
  size: number;
  seasonNumber?: number;
  series?: { id: number; title: string };
  episodes?: { id: number; seasonNumber: number; episodeNumber: number; title: string }[];
  movie?: { id: number; title: string; year?: number };
  quality?: unknown;
  languages?: unknown[];
  releaseGroup?: string;
  downloadId?: string;
  indexerFlags?: number;
  releaseType?: string;
  rejections?: (string | { reason?: string })[];
}

/** "copy" es "Hardlink o copiar" en Sonarr/Radarr: crea un hardlink si el disco lo permite y si no, copia. */
export type ImportMode = "copy" | "move";

export type ManualImportTarget = { seriesId: number; seasonNumber: number; episodeIds: number[] } | { movieId: number };

export function rejectionText(r: string | { reason?: string }) {
  return typeof r === "string" ? r : (r.reason ?? "");
}

export function getManualImport(service: ArrService, downloadId: string) {
  return apiRequest<ManualImportItem[]>(service, { path: "/api/v3/manualimport", query: { downloadId, filterExistingFiles: true } });
}

export function runManualImport(
  service: ArrService,
  files: { item: ManualImportItem; target: ManualImportTarget }[],
  importMode: ImportMode,
) {
  return apiRequest<CommandStatus>(service, {
    method: "POST",
    path: "/api/v3/command",
    json: {
      name: "ManualImport",
      importMode,
      files: files.map(({ item, target }) => ({
        path: item.path,
        folderName: item.folderName,
        quality: item.quality,
        languages: item.languages,
        releaseGroup: item.releaseGroup,
        downloadId: item.downloadId,
        indexerFlags: item.indexerFlags ?? 0,
        releaseType: item.releaseType,
        ...target,
      })),
    },
  });
}

/** Nota que trae Radarr/Sonarr de su proveedor: sobre 10 (IMDb, TMDb, Trakt, TVDB) o sobre 100 (Metacritic, Rotten Tomatoes). */
export interface ArrRating {
  value?: number;
  votes?: number;
}
