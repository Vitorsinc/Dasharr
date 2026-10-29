import { apiRequest, fetchTorrent } from "@/lib/tauri";
import { qbit } from "./qbit";

export interface Indexer {
  id: number;
  name: string;
  enable: boolean;
  protocol: "torrent" | "usenet";
}

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
  search: (query: string, category: SearchCategory, indexerIds: number[]) =>
    apiRequest<SearchResult[]>("prowlarr", {
      path: "/api/v1/search",
      query: { query, type: "search", categories: CATEGORY_IDS[category], indexerIds, limit: 100 },
    }),
};
