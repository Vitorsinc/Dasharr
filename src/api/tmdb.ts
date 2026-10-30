import { invoke } from "@tauri-apps/api/core";

/** Fechas de un país en formato `AAAA-MM-DD`. */
export interface CountryReleaseDates {
  cinema?: string | null;
  digital?: string | null;
  physical?: string | null;
}

export const tmdbHasKey = () => invoke<boolean>("tmdb_has_key");

/** Comprueba la clave con TMDB y la guarda. Vacía, la borra. */
export const tmdbSaveKey = (key: string) => invoke<void>("tmdb_save_key", { key });

/** Fechas de estreno en un país, por tmdbId. Sin clave de TMDB devuelve un mapa vacío. */
export const tmdbReleaseDates = (ids: number[], country: string) =>
  invoke<Record<string, CountryReleaseDates>>("tmdb_release_dates", { ids, country });
