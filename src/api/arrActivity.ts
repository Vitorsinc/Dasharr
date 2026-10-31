import { apiRequest } from "@/lib/tauri";
import { waitForCommand, type ArrService, type CommandStatus, type Paged } from "./arr";

/** Release bloqueada: el *arr no la vuelve a descargar. Radarr trae `movie`; Sonarr, `series` y los episodios. */
export interface BlocklistItem {
  id: number;
  sourceTitle: string;
  date: string;
  protocol?: "torrent" | "usenet" | "unknown";
  indexer?: string;
  message?: string;
  quality?: { quality?: { name?: string } };
  movieId?: number;
  movie?: { id: number; title: string; year?: number };
  seriesId?: number;
  series?: { id: number; title: string };
  episodeIds?: number[];
}

export const BLOCKLIST_PAGE = 50;

/** Blocklist e historial global de Radarr/Sonarr (la sección «Actividad» de sus webs). */
export function arrActivity(service: ArrService) {
  return {
    getBlocklist: (page: number, pageSize = BLOCKLIST_PAGE) =>
      apiRequest<Paged<BlocklistItem>>(service, {
        path: "/api/v3/blocklist",
        query: { page, pageSize, sortKey: "date", sortDirection: "descending" },
      }),
    removeBlocklist: (id: number) => apiRequest<unknown>(service, { method: "DELETE", path: `/api/v3/blocklist/${id}` }),
    removeBlocklistBulk: (ids: number[]) =>
      apiRequest<unknown>(service, { method: "DELETE", path: "/api/v3/blocklist/bulk", json: { ids } }),
    /**
     * Vacía la blocklist entera con el mismo comando que el botón «Clear» de Radarr/Sonarr. Es asíncrono:
     * se espera (como mucho 30 s) a que termine para que la lista recargada ya salga vacía.
     */
    clearBlocklist: async () => {
      const c = await apiRequest<CommandStatus | null>(service, { method: "POST", path: "/api/v3/command", json: { name: "ClearBlocklist" } });
      if (c?.id != null) await waitForCommand(service, c.id, { intervalMs: 1000, timeoutMs: 30_000 });
    },
    /**
     * Marca como fallida una descarga del historial (un «grabbed»): el *arr bloquea esa release y, si
     * «Redownload Failed» está activo en sus ajustes, busca otra.
     */
    markFailed: (historyId: number) => apiRequest<unknown>(service, { method: "POST", path: `/api/v3/history/failed/${historyId}` }),
  };
}

/** Qué se ha bloqueado: la película o la serie (de la propia entrada o de la biblioteca) o, si no, la release. */
export function blocklistTitle(b: BlocklistItem, titles: Map<number, string>): string {
  if (b.movie?.title) return b.movie.year ? `${b.movie.title} (${b.movie.year})` : b.movie.title;
  if (b.series?.title) return b.series.title;
  const id = b.movieId ?? b.seriesId;
  return (id != null ? titles.get(id) : undefined) ?? b.sourceTitle;
}
