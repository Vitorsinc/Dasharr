import { apiRequest } from "@/lib/tauri";

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

export const prowlarr = {
  getIndexers: () => apiRequest<Indexer[]>("prowlarr", { path: "/api/v1/indexer" }),
  search: (query: string, category: SearchCategory, indexerIds: number[]) =>
    apiRequest<SearchResult[]>("prowlarr", {
      path: "/api/v1/search",
      query: { query, type: "search", categories: CATEGORY_IDS[category], indexerIds, limit: 100 },
    }),
};
