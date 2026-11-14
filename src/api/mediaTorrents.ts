import { apiRequest } from "@/lib/tauri";
import type { DeleteOptions, HistoryRecord } from "./arr";
import { qbit, type Torrent } from "./qbit";

export type LibraryService = "radarr" | "sonarr";

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

/** De esos ids, los torrents que siguen en qBittorrent (las descargas de usenet u otros clientes se quedan fuera). */
export async function torrentsInQbit(ids: Set<string>): Promise<Torrent[]> {
  if (ids.size === 0) return [];
  return (await qbit.getTorrents()).filter((t) => ids.has(t.hash.toLowerCase()));
}

/** Torrents de qBittorrent que el *arr descargó para estas películas o series. */
export const findTorrents = async (service: LibraryService, ids: number[]) => torrentsInQbit(await historyDownloadIds(service, ids));

/**
 * Quita películas o series de la biblioteca y, si se pide, también sus torrents de qBittorrent con
 * los archivos descargados (salvo los que comparte otro torrent que se queda). Los torrents se buscan antes de borrar; si qBittorrent no responde no
 * se borra nada, para poder reintentar. Devuelve cuántos torrents se quitaron.
 */
export async function deleteWithTorrents(
  service: LibraryService,
  ids: number[],
  o: DeleteOptions,
  deleteMedia: () => Promise<unknown>,
): Promise<number> {
  // El diálogo ya los buscó para enseñarlos; si no llegó a tiempo, se buscan ahora.
  const hashes = !o.deleteTorrents ? [] : (o.torrentHashes ?? (await findTorrents(service, ids)).map((t) => t.hash));
  await deleteMedia();
  // Sin romper el cross-seed: si otro torrent que se queda usa los mismos archivos, se dejan.
  if (hashes.length) await qbit.removeWithFiles(hashes);
  return hashes.length;
}
