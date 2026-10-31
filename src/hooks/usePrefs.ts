import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SeriesKind } from "@/lib/anime";

export type Theme = "dark" | "light" | "system";
export interface LibraryDefaults {
  rootFolderPath?: string;
  qualityProfileId?: number;
}
/** Fuentes de notas que se pueden mostrar u ocultar en Ajustes. */
export const RATING_SOURCES = ["filmaffinity", "imdb", "tmdb", "rottenTomatoes", "metacritic", "trakt", "tvdb"] as const;
export type RatingSource = (typeof RATING_SOURCES)[number];

export interface Prefs {
  theme: Theme;
  notifications: boolean;
  plexNotifications: boolean;
  /** Carpeta y perfil de Sonarr con los que se añaden series y anime. */
  seriesDefaults: Partial<Record<SeriesKind, LibraryDefaults>>;
  /** Carpeta y perfil de Radarr con los que se añaden películas. */
  movieDefaults: LibraryDefaults;
  /** Grupos del menú lateral que el usuario ha plegado. */
  sidebarCollapsed: string[];
  /** Notas que el usuario ha decidido no ver. */
  hiddenRatings: RatingSource[];
  /** País (ISO 3166-1) cuyas fechas de estreno de películas se muestran. */
  releaseCountry: string;
  /** Cómo se ve la semana en el calendario. */
  weekStyle: "agenda" | "posters" | "strip";
  /** Instalar sola la versión nueva al encontrarla (avisando antes unos segundos). */
  autoUpdate: boolean;
}

const KEY = "dasharr.prefs";
const DEFAULTS: Prefs = {
  theme: "dark",
  notifications: true,
  plexNotifications: true,
  seriesDefaults: {},
  movieDefaults: {},
  sidebarCollapsed: [],
  hiddenRatings: [],
  releaseCountry: "ES",
  weekStyle: "agenda",
  autoUpdate: true,
};
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function setPrefs(patch: Partial<Prefs>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sin almacenamiento: se mantiene en memoria */
  }
  listeners.forEach((l) => l());
}

export function getPrefs(): Prefs {
  return read();
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    read,
  );
  return [prefs, useCallback(setPrefs, [])];
}

/** Aplica el tema elegido a <html>. */
export function useApplyTheme() {
  const [{ theme }] = usePrefs();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [theme]);
}
