import { apiRequest, fetchTorrent } from "@/lib/tauri";
import { validationMessage } from "@/lib/errors";
import type { HealthItem, Paged } from "./arr";
import { qbit } from "./qbit";

export interface Indexer {
  id: number;
  name: string;
  enable: boolean;
  protocol: "torrent" | "usenet";
  privacy?: "public" | "semiPrivate" | "private";
  priority?: number;
  definitionName?: string;
}

/** Campo de configuración de un proveedor (indexador, aplicación) tal como lo describe Prowlarr. */
export interface ProviderField {
  order?: number;
  name: string;
  label?: string;
  helpText?: string;
  helpLink?: string;
  value?: unknown;
  /** textbox, password, number, checkbox, select, tag, url, path, info, textArea… */
  type: string;
  advanced?: boolean;
  /** "hidden" o "hiddenIfNotSet": no se enseña. */
  hidden?: string;
  selectOptions?: { value: number | string; name: string; order?: number; hint?: string }[];
  unit?: string;
  placeholder?: string;
  isFloat?: boolean;
}

/** Indexador completo (o definición del esquema para crear uno). Se devuelve entero al guardar. */
export interface IndexerFull extends Indexer {
  implementation?: string;
  implementationName?: string;
  configContract?: string;
  description?: string;
  language?: string;
  infoLink?: string;
  appProfileId?: number;
  tags?: number[];
  fields?: ProviderField[];
  [extra: string]: unknown;
}

export interface AppProfile {
  id: number;
  name: string;
}

/** Estadísticas por indexador de `GET /indexerstats`. */
export interface IndexerStat {
  indexerId: number;
  indexerName: string;
  averageResponseTime?: number;
  numberOfQueries?: number;
  numberOfGrabs?: number;
  numberOfRssQueries?: number;
  numberOfAuthQueries?: number;
  numberOfFailedQueries?: number;
  numberOfFailedGrabs?: number;
  numberOfFailedRssQueries?: number;
  numberOfFailedAuthQueries?: number;
}

export type ProwlarrEvent = "releaseGrabbed" | "indexerQuery" | "indexerRss" | "indexerAuth" | "indexerInfo" | "unknown";

/** Número que espera `eventType` en `GET /history` (enum `HistoryEventType` de Prowlarr). */
export const PROWLARR_EVENT_IDS: Record<Exclude<ProwlarrEvent, "unknown">, number> = {
  releaseGrabbed: 1,
  indexerQuery: 2,
  indexerRss: 3,
  indexerAuth: 4,
  indexerInfo: 5,
};

export interface ProwlarrHistoryRecord {
  id: number;
  indexerId: number;
  date: string;
  successful: boolean;
  eventType: ProwlarrEvent;
  downloadId?: string;
  data?: Record<string, string | undefined>;
}

/** Aplicación (Radarr, Sonarr…) a la que Prowlarr manda sus indexadores. */
export interface ProwlarrApp {
  id: number;
  name: string;
  implementation?: string;
  implementationName?: string;
  syncLevel: "disabled" | "addOnly" | "fullSync";
  tags?: number[];
  [extra: string]: unknown;
}

export const HISTORY_PAGE = 50;

/** Fallos recientes de un indexador; con `disabledTill` en el futuro, Prowlarr no lo usa hasta esa hora. */
export interface IndexerStatus {
  indexerId: number;
  disabledTill?: string;
  mostRecentFailure?: string;
  initialFailure?: string;
}

/** Texto de una prueba fallida: Prowlarr responde 400 con la lista de fallos de validación. */
export const testFailure = validationMessage;

export interface SearchResult {
  guid: string;
  title: string;
  indexer: string;
  indexerId: number;
  size: number;
  seeders?: number;
  leechers?: number;
  publishDate?: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoUrl?: string;
  protocol: "torrent" | "usenet";
}

export type SearchCategory = "all" | "movies" | "tv";
const CATEGORY_IDS: Record<SearchCategory, number[]> = { all: [], movies: [2000], tv: [5000] };

export type ResultSort = "seeders" | "size" | "age";
export const RESULT_SORTS: readonly ResultSort[] = ["seeders", "size", "age"];

export function sortResults(list: SearchResult[], by: ResultSort): SearchResult[] {
  const out = [...list];
  if (by === "seeders") out.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
  if (by === "size") out.sort((a, b) => b.size - a.size);
  if (by === "age") out.sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""));
  return out;
}

export function torrentLink(r: SearchResult): string | undefined {
  if (r.protocol !== "torrent") return undefined;
  return r.magnetUrl || r.downloadUrl;
}

/**
 * Envía un resultado a qBittorrent. El magnet va tal cual; el `downloadUrl` es un enlace al propio Prowlarr construido
 * con la dirección que usa Dasharr (quizá la externa, con proxy), así que Dasharr baja el .torrent y lo sube como archivo.
 */
export async function sendToQbit(r: SearchResult, category?: string) {
  if (r.magnetUrl) return qbit.addUrls([r.magnetUrl], category);
  if (!r.downloadUrl) throw new Error("Este resultado no tiene enlace de descarga");
  const got = await fetchTorrent("prowlarr", r.downloadUrl);
  if (got.type === "magnet") return qbit.addUrls([got.value], category);
  const name = `${r.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150)}.torrent`;
  return qbit.addFile({ field: "torrents", filename: name, base64: got.value }, category);
}

export const prowlarr = {
  getIndexers: () => apiRequest<Indexer[]>("prowlarr", { path: "/api/v1/indexer" }),
  getIndexerStatus: () => apiRequest<IndexerStatus[]>("prowlarr", { path: "/api/v1/indexerstatus" }),
  getHealth: () => apiRequest<HealthItem[]>("prowlarr", { path: "/api/v1/health" }),
  /** Se manda el indexador completo tal como lo devolvió Prowlarr, cambiando solo `enable`. */
  setEnabled: (indexer: Indexer, enable: boolean) =>
    apiRequest<Indexer>("prowlarr", { method: "PUT", path: `/api/v1/indexer/${indexer.id}`, json: { ...indexer, enable } }),
  /** Prueba un indexador (conexión y credenciales); lanza un error con el motivo si falla. */
  test: (indexer: Indexer) =>
    apiRequest<unknown>("prowlarr", { method: "POST", path: "/api/v1/indexer/test", query: { forceTest: true }, json: indexer }),
  /** Definiciones de todos los indexadores que Prowlarr sabe crear, con sus campos (es una respuesta grande). */
  getSchema: () => apiRequest<IndexerFull[]>("prowlarr", { path: "/api/v1/indexer/schema" }),
  getAppProfiles: () => apiRequest<AppProfile[]>("prowlarr", { path: "/api/v1/appprofile" }),
  /** Prowlarr prueba el indexador al crearlo y responde 400 con el motivo si no funciona. */
  createIndexer: (ix: IndexerFull) => apiRequest<IndexerFull>("prowlarr", { method: "POST", path: "/api/v1/indexer", json: { ...ix, id: undefined } }),
  updateIndexer: (ix: IndexerFull) => apiRequest<IndexerFull>("prowlarr", { method: "PUT", path: `/api/v1/indexer/${ix.id}`, json: ix }),
  deleteIndexer: (id: number) => apiRequest<unknown>("prowlarr", { method: "DELETE", path: `/api/v1/indexer/${id}` }),
  getStats: () => apiRequest<{ indexers?: IndexerStat[] }>("prowlarr", { path: "/api/v1/indexerstats" }),
  getHistory: (page: number, eventType?: number, pageSize = HISTORY_PAGE) =>
    apiRequest<Paged<ProwlarrHistoryRecord>>("prowlarr", {
      path: "/api/v1/history",
      query: { page, pageSize, sortKey: "date", sortDirection: "descending", eventType },
    }),
  getApplications: () => apiRequest<ProwlarrApp[]>("prowlarr", { path: "/api/v1/applications" }),
  /** Manda ya los indexadores a todas las aplicaciones (comando `ApplicationIndexerSync`). */
  syncApplications: () =>
    apiRequest<unknown>("prowlarr", { method: "POST", path: "/api/v1/command", json: { name: "ApplicationIndexerSync" } }),
  search: (query: string, category: SearchCategory, indexerIds: number[]) =>
    apiRequest<SearchResult[]>("prowlarr", {
      path: "/api/v1/search",
      query: { query, type: "search", categories: CATEGORY_IDS[category], indexerIds, limit: 100 },
    }),
};
