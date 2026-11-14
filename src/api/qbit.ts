import { apiRequest } from "@/lib/tauri";
import { t } from "@/i18n/es";
import { isApiError, type FilePart } from "@/lib/types";

export interface Torrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  state: string;
  category: string;
  num_seeds: number;
  num_leechs: number;
  ratio: number;
  added_on: number;
  completion_on: number;
  amount_left: number;
  /** Motivo del error (qBittorrent 5.3+). */
  error?: string;
  save_path?: string;
  /** Ruta de lo descargado: la carpeta del torrent o, si es un solo archivo, ese archivo. */
  content_path?: string;
  /** Tracker que está funcionando ahora (URL de anuncio: puede llevar la passkey, no mostrarla entera). */
  tracker?: string;
  /** Segundos sembrando en total. */
  seeding_time?: number;
  /** Semillas y pares de todo el enjambre según el tracker (`num_seeds`/`num_leechs` son los conectados). */
  num_complete?: number;
  num_incomplete?: number;
  uploaded?: number;
  /** Límites efectivos (los del torrent o, si no tiene, los globales): ratio y minutos sembrando; -1 = sin límite. */
  max_ratio?: number;
  max_seeding_time?: number;
  /** Límites de velocidad en bytes/s; 0 o -1 = sin límite. */
  dl_limit?: number;
  up_limit?: number;
}

export interface TorrentProperties {
  save_path: string;
  addition_date: number;
  completion_date: number;
  share_ratio: number;
  total_downloaded: number;
  total_uploaded: number;
  seeds: number;
  seeds_total: number;
  peers: number;
  peers_total: number;
  dl_limit: number;
  up_limit: number;
  comment?: string;
  is_private?: boolean;
}

export interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  /** 0 = no descargar, 1 = normal, 6 = alta, 7 = máxima. */
  priority: number;
}

export interface TorrentTracker {
  url: string;
  /** 0 desactivado, 1 sin contactar, 2 funciona, 3 actualizando, 4 no funciona (5 y 6, errores en qBittorrent 5). */
  status: number;
  tier: number;
  num_seeds: number;
  num_leeches: number;
  num_peers: number;
  msg: string;
}

export interface TorrentPeer {
  ip: string;
  port: number;
  client: string;
  country?: string;
  progress: number;
  dl_speed: number;
  up_speed: number;
}

export interface TransferInfo {
  dl_info_speed: number;
  up_info_speed: number;
}

export interface ServerState {
  free_space_on_disk?: number;
  use_alt_speed_limits?: boolean;
  dl_info_speed?: number;
  up_info_speed?: number;
}

export type TorrentGroup = "downloading" | "seeding" | "paused" | "completed" | "error";

const DOWNLOADING = new Set([
  "downloading",
  "metaDL",
  "forcedMetaDL",
  "forcedDL",
  "stalledDL",
  "queuedDL",
  "checkingDL",
  "allocating",
  "checkingResumeData",
  "moving",
]);
const SEEDING = new Set(["uploading", "stalledUP", "forcedUP", "queuedUP", "checkingUP"]);
const PAUSED = new Set(["pausedDL", "pausedUP", "stoppedDL", "stoppedUP"]);
const ERROR = new Set(["error", "missingFiles", "unknown"]);

export function torrentGroup(t: Pick<Torrent, "state" | "progress">): TorrentGroup {
  if (ERROR.has(t.state)) return "error";
  if (PAUSED.has(t.state)) return t.progress >= 1 ? "completed" : "paused";
  if (SEEDING.has(t.state)) return "seeding";
  if (DOWNLOADING.has(t.state)) return "downloading";
  return t.progress >= 1 ? "completed" : "downloading";
}

export function isActive(t: Torrent) {
  return torrentGroup(t) === "downloading";
}

/** Torrents que han pasado de incompletos a completos entre dos lecturas. */
export function detectCompleted(prev: Torrent[] | undefined, next: Torrent[]): Torrent[] {
  if (!prev) return [];
  const before = new Map(prev.map((t) => [t.hash, t.progress]));
  return next.filter((t) => t.progress >= 1 && before.has(t.hash) && before.get(t.hash)! < 1);
}

/**
 * Dónde están los datos de un torrent. Dos torrents con la misma clave siembran los mismos archivos
 * (cross-seed: el mismo contenido en varios trackers).
 */
export function contentKey(t: Pick<Torrent, "content_path" | "save_path" | "name" | "hash">): string {
  const path = t.content_path || (t.save_path ? `${t.save_path}/${t.name}` : "");
  return path ? path.replace(/\\/g, "/").replace(/\/+$/, "") : `#${t.hash}`;
}

/**
 * Por cada torrent, los otros que comparten sus archivos: los que tienen la misma ruta o una que
 * está dentro de la suya (un episodio suelto dentro de la carpeta de un pack).
 */
export function sharedContent(torrents: Torrent[]): Map<string, Torrent[]> {
  const byKey = new Map<string, Torrent[]>();
  for (const t of torrents) byKey.set(contentKey(t), [...(byKey.get(contentKey(t)) ?? []), t]);
  const keys = [...byKey.keys()].sort();
  const out = new Map<string, Set<Torrent>>();
  const link = (a: Torrent, b: Torrent) => {
    if (a === b) return;
    out.set(a.hash, (out.get(a.hash) ?? new Set()).add(b));
    out.set(b.hash, (out.get(b.hash) ?? new Set()).add(a));
  };
  keys.forEach((key, i) => {
    const group = byKey.get(key)!;
    for (const a of group) for (const b of group) link(a, b);
    if (key.startsWith("#")) return;
    // Ordenadas, las rutas de dentro van justo después (salvo hermanas como «Carpeta.2», que se saltan).
    for (let j = i + 1; j < keys.length && keys[j].startsWith(key); j++)
      if (keys[j].startsWith(`${key}/`)) for (const a of group) for (const b of byKey.get(keys[j])!) link(a, b);
  });
  return new Map([...out].map(([hash, set]) => [hash, [...set]]));
}

export interface RemovalPlan {
  /** Se borran con sus archivos. */
  withFiles: string[];
  /** Solo se quita el torrent: sus archivos los sigue usando otro que no se borra. */
  keepFiles: string[];
  /** Bytes que se liberan (los archivos compartidos entre varios borrados cuentan una vez). */
  freed: number;
}

/** Qué torrents se pueden borrar con archivos sin romper a otro que siembra los mismos. */
export function planRemoval(hashes: string[], torrents: Torrent[]): RemovalPlan {
  const going = new Set(hashes);
  const shared = sharedContent(torrents);
  const plan: RemovalPlan = { withFiles: [], keepFiles: [], freed: 0 };
  const counted = new Set<string>();
  for (const t of torrents) {
    if (!going.has(t.hash)) continue;
    if ((shared.get(t.hash) ?? []).some((o) => !going.has(o.hash))) {
      plan.keepFiles.push(t.hash);
      continue;
    }
    plan.withFiles.push(t.hash);
    const key = contentKey(t);
    if (!counted.has(key)) plan.freed += t.size;
    counted.add(key);
  }
  // Los que ya no están en qBittorrent se piden igual: borrarlos no hace nada.
  const seen = new Set(torrents.map((t) => t.hash));
  plan.withFiles.push(...hashes.filter((h) => !seen.has(h)));
  return plan;
}

const join = (hashes: string[]) => hashes.join("|");
const post = (path: string, form: Record<string, string>) => apiRequest<unknown>("qbittorrent", { method: "POST", path, form });

/** qBittorrent 5 renombró pause/resume a stop/start: se prueba el nombre nuevo y se recurre al antiguo si da 404. */
async function postWithFallback(path: string, legacy: string, form: Record<string, string>) {
  try {
    return await post(path, form);
  } catch (e) {
    if (isApiError(e) && e.kind === "Http" && e.status === 404) return post(legacy, form);
    throw e;
  }
}

/** Error cuando qBittorrent rechaza todos los torrents de un `torrents/add`. */
export class AddRejectedError extends Error {}

/**
 * `torrents/add` responde "Ok."/"Fails." hasta la 5.1 y JSON con `failure_count` desde la 5.2 (y 409 si fallan todos).
 * Sin comprobarlo, un "Fails." con código 200 parecería un éxito.
 */
async function checkAdded(call: Promise<unknown>) {
  let res: unknown;
  try {
    res = await call;
  } catch (e) {
    if (isApiError(e) && e.kind === "Http" && e.status === 409) throw new AddRejectedError(t.downloads.addRejected);
    throw e;
  }
  const failed =
    (typeof res === "string" && res.trim() === "Fails.") ||
    (typeof res === "object" &&
      res !== null &&
      Number((res as { failure_count?: unknown }).failure_count) > 0 &&
      !Number((res as { success_count?: unknown }).success_count) &&
      !Number((res as { pending_count?: unknown }).pending_count));
  if (failed) throw new AddRejectedError(t.downloads.addRejected);
  return res;
}

export const qbit = {
  getTorrents: () => apiRequest<Torrent[]>("qbittorrent", { path: "/api/v2/torrents/info", query: { sort: "added_on", reverse: true } }),
  getServerState: async () =>
    (await apiRequest<{ server_state?: ServerState }>("qbittorrent", { path: "/api/v2/sync/maindata", query: { rid: 0 } })).server_state ??
    {},
  getCategories: async () => Object.keys(await apiRequest<Record<string, unknown>>("qbittorrent", { path: "/api/v2/torrents/categories" })),
  pause: (hashes: string[]) => postWithFallback("/api/v2/torrents/stop", "/api/v2/torrents/pause", { hashes: join(hashes) }),
  resume: (hashes: string[]) => postWithFallback("/api/v2/torrents/start", "/api/v2/torrents/resume", { hashes: join(hashes) }),
  forceStart: (hashes: string[]) => post("/api/v2/torrents/setForceStart", { hashes: join(hashes), value: "true" }),
  recheck: (hashes: string[]) => post("/api/v2/torrents/recheck", { hashes: join(hashes) }),
  remove: (hashes: string[], deleteFiles: boolean) =>
    post("/api/v2/torrents/delete", { hashes: join(hashes), deleteFiles: String(deleteFiles) }),
  /**
   * Borra torrents con sus archivos, salvo los que comparten archivos con otro torrent que se queda
   * (cross-seed): de esos solo se quita el torrent, para no dejar al otro sin datos. Mira la lista
   * de qBittorrent en el momento de borrar.
   */
  removeWithFiles: async (hashes: string[]): Promise<RemovalPlan> => {
    const plan = planRemoval(hashes, await qbit.getTorrents());
    if (plan.keepFiles.length) await qbit.remove(plan.keepFiles, false);
    if (plan.withFiles.length) await qbit.remove(plan.withFiles, true);
    return plan;
  },
  getProperties: (hash: string) => apiRequest<TorrentProperties>("qbittorrent", { path: "/api/v2/torrents/properties", query: { hash } }),
  getFiles: (hash: string) => apiRequest<TorrentFile[]>("qbittorrent", { path: "/api/v2/torrents/files", query: { hash } }),
  setFilePriority: (hash: string, indexes: number[], priority: number) =>
    post("/api/v2/torrents/filePrio", { hash, id: indexes.join("|"), priority: String(priority) }),
  getTrackers: (hash: string) => apiRequest<TorrentTracker[]>("qbittorrent", { path: "/api/v2/torrents/trackers", query: { hash } }),
  getPeers: async (hash: string) =>
    Object.values(
      (
        await apiRequest<{ peers?: Record<string, TorrentPeer> }>("qbittorrent", {
          path: "/api/v2/sync/torrentPeers",
          query: { hash, rid: 0 },
        })
      ).peers ?? {},
    ),
  /** Categoría vacía = quitarla. */
  setCategory: (hashes: string[], category: string) => post("/api/v2/torrents/setCategory", { hashes: join(hashes), category }),
  /** Límites en bytes/s; 0 = sin límite. */
  setDownloadLimit: (hashes: string[], limit: number) =>
    post("/api/v2/torrents/setDownloadLimit", { hashes: join(hashes), limit: String(limit) }),
  setUploadLimit: (hashes: string[], limit: number) =>
    post("/api/v2/torrents/setUploadLimit", { hashes: join(hashes), limit: String(limit) }),
  toggleAltSpeed: () => post("/api/v2/transfer/toggleSpeedLimitsMode", {}),
  addUrls: (urls: string[], category?: string) =>
    checkAdded(
      apiRequest<unknown>("qbittorrent", {
        method: "POST",
        path: "/api/v2/torrents/add",
        multipart: true,
        form: { urls: urls.join("\n"), ...(category ? { category } : {}) },
      }),
    ),
  addFile: (file: FilePart, category?: string) =>
    checkAdded(
      apiRequest<unknown>("qbittorrent", {
        method: "POST",
        path: "/api/v2/torrents/add",
        form: category ? { category } : {},
        files: [{ ...file, field: "torrents" }],
      }),
    ),
};
