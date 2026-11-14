import { invoke } from "@tauri-apps/api/core";
import type { FetchedTorrent } from "@/lib/tauri";
import { qbit } from "./qbit";

export type TrackerStatus = "ok" | "unauthorized" | "unsupported" | "rateLimited" | "unavailable";

export interface TrackerUser {
  username: string;
  group: string;
  uploaded: number | null;
  downloaded: number | null;
  /** `null` = ∞ (no se ha bajado nada). */
  ratio: number | null;
  /** Puede ser negativo (por debajo del ratio mínimo). */
  buffer: number | null;
  bufferInfinite: boolean;
  seeding: number | null;
  leeching: number | null;
  seedbonus: number | null;
  hitAndRuns: number | null;
}

export interface TrackerStats {
  indexerId: number;
  name: string;
  siteUrl: string;
  status: TrackerStatus;
  message: string | null;
  user: TrackerUser | null;
}

/** Trackers UNIT3D de Prowlarr con sus estadísticas. Los tokens se quedan en el backend. */
export const getTrackerStats = () => invoke<TrackerStats[]>("unit3d_stats");

/** Torrent en freeleech o con doble subida. El enlace de descarga se queda en el backend (lleva la clave RSS). */
export interface TrackerDeal {
  id: number;
  name: string;
  category: string | null;
  releaseType: string | null;
  resolution: string | null;
  size: number | null;
  /** 0, 25, 50, 75 o 100. */
  freeleech: number;
  doubleUpload: boolean;
  seeders: number | null;
  leechers: number | null;
  completed: number | null;
  createdAt: string | null;
  poster: string | null;
  tmdbId: number | null;
  detailsUrl: string | null;
}

export interface TrackerDeals {
  indexerId: number;
  name: string;
  status: TrackerStatus;
  message: string | null;
  torrents: TrackerDeal[];
}

/** Freeleech y doble subida de cada tracker UNIT3D de Prowlarr. */
export const getTrackerDeals = () => invoke<TrackerDeals[]>("unit3d_deals");

/** Baja el .torrent del tracker y lo sube a qBittorrent. */
export async function sendDealToQbit(indexerId: number, deal: TrackerDeal, category?: string) {
  const got = await invoke<FetchedTorrent>("unit3d_fetch_torrent", { indexerId, torrentId: deal.id });
  if (got.type === "magnet") return qbit.addUrls([got.value], category);
  const name = `${deal.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150)}.torrent`;
  return qbit.addFile({ field: "torrents", filename: name, base64: got.value }, category);
}
