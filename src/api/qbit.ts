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
