import { invoke } from "@tauri-apps/api/core";

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
