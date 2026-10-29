import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Movie } from "./radarr";
import type { Series } from "./sonarr";

export interface FaItem {
  kind: "movie" | "series";
  /** tmdbId en películas, tvdbId en series. */
  id: number;
  title: string;
  originalTitle?: string | null;
  year?: number | null;
}

export interface FaRating {
  id: number;
  url: string;
  title: string;
  year?: number | null;
  rating?: number | null;
  votes?: number | null;
}

export const faKey = (i: FaItem) => `${i.kind}:${i.id}`;

export const movieItem = (m: Movie): FaItem => ({
  kind: "movie",
  id: m.tmdbId,
  title: m.title,
  originalTitle: m.originalTitle,
  year: m.year || null,
});

export const seriesItem = (s: Series): FaItem => ({ kind: "series", id: s.tvdbId, title: s.title, year: s.year || null });

/** Notas ya guardadas; las que falten se piden en segundo plano y llegan con `onFaRating`. */
export const faRatings = (items: FaItem[]) => invoke<Record<string, FaRating>>("filmaffinity_ratings", { items });

/** Nota de una ficha, consultada al momento si no está guardada. */
export const faRating = (item: FaItem) => invoke<FaRating | null>("filmaffinity_rating", { item });

export function onFaRating(cb: (key: string, rating: FaRating | null) => void): Promise<UnlistenFn> {
  return listen<{ key: string; rating: FaRating | null }>("filmaffinity-rating", (e) => cb(e.payload.key, e.payload.rating));
}
