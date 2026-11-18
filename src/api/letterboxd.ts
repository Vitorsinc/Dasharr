import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Nota de Letterboxd de una película (sobre 5). Letterboxd es solo de cine: no hay series. */
export interface LbRating {
  url: string;
  title: string;
  rating?: number | null;
  votes?: number | null;
}

/** Notas ya guardadas, por id de TMDb; las que falten se piden en segundo plano y llegan con `onLbRating`. */
export const lbRatings = (tmdbIds: number[]) => invoke<Record<string, LbRating>>("letterboxd_ratings", { tmdbIds });

/** Deja de consultar en segundo plano lo que quedaba pendiente. */
export const lbClearQueue = () => invoke<void>("letterboxd_clear_queue");

/** Nota de una ficha, consultada al momento si no está guardada. */
export const lbRating = (tmdbId: number) => invoke<LbRating | null>("letterboxd_rating", { tmdbId });

export function onLbRating(cb: (tmdbId: number, rating: LbRating | null) => void): Promise<UnlistenFn> {
  return listen<{ tmdbId: number; rating: LbRating | null }>("letterboxd-rating", (e) => cb(e.payload.tmdbId, e.payload.rating));
}
