import { apiRequest } from "@/lib/tauri";
import type { DeleteOptions, HistoryRecord } from "./arr";
import { qbit } from "./qbit";

type LibraryService = "radarr" | "sonarr";

/**
 * Hashes de los torrents que el *arr descargó para estas películas o series: el `downloadId` de su
 * historial (el *arr lo guarda en mayúsculas; qBittorrent usa minúsculas). Hay que leerlo antes de
 * borrar, porque al quitar la película o la serie el *arr borra también su historial.
 */
export async function historyDownloadIds(service: LibraryService, ids: number[]): Promise<Set<string>> {
  const out = new Set<string>();
  // De pocos en pocos para no saturar el *arr si se borran muchas a la vez.
  for (let i = 0; i < ids.length; i += 5) {
    const lists = await Promise.all(
      ids.slice(i, i + 5).map((id) =>
        service === "radarr"
          ? apiRequest<HistoryRecord[]>("radarr", { path: "/api/v3/history/movie", query: { movieId: id } })
          : apiRequest<HistoryRecord[]>("sonarr", { path: "/api/v3/history/series", query: { seriesId: id } }),
      ),
    );
    for (const r of lists.flat()) {
      const id = r.downloadId?.trim().toLowerCase();
      if (id) out.add(id);
    }
  }
  return out;
}

/** De esos ids, los que siguen en qBittorrent (las descargas de usenet u otros clientes se quedan fuera). */
export async function torrentsInQbit(ids: Set<string>): Promise<string[]> {
  if (ids.size === 0) return [];
  return (await qbit.getTorrents()).map((t) => t.hash.toLowerCase()).filter((h) => ids.has(h));
}

/**
 * Quita películas o series de la biblioteca y, si se pide, también sus torrents de qBittorrent con
 * los archivos descargados. Los torrents se buscan antes de borrar; si qBittorrent no responde no
 * se borra nada, para poder reintentar. Devuelve cuántos torrents se quitaron.
 */
export async function deleteWithTorrents(
  service: LibraryService,
  ids: number[],
  o: DeleteOptions,
  deleteMedia: () => Promise<unknown>,
): Promise<number> {
  const hashes = o.deleteTorrents ? await torrentsInQbit(await historyDownloadIds(service, ids)) : [];
  await deleteMedia();
  if (hashes.length) await qbit.remove(hashes, true);
  return hashes.length;
}
