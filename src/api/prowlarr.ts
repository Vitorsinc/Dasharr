import { apiRequest, fetchTorrent } from "@/lib/tauri";
import { validationMessage } from "@/lib/errors";
import type { HealthItem } from "./arr";
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
  search: (query: string, category: SearchCategory, indexerIds: number[]) =>
    apiRequest<SearchResult[]>("prowlarr", {
      path: "/api/v1/search",
      query: { query, type: "search", categories: CATEGORY_IDS[category], indexerIds, limit: 100 },
    }),
};
