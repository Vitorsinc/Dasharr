import { t } from "@/i18n/es";
import { apiRequest, type ApiCall } from "@/lib/tauri";
import { isApiError } from "@/lib/types";
import type { HealthItem } from "./arr";

export interface SubLang {
  name: string;
  code2: string;
  code3?: string;
  forced?: boolean;
  hi?: boolean;
}

export interface WantedMovie {
  title: string;
  radarrId: number;
  missing_subtitles: SubLang[];
}

export interface WantedEpisode {
  seriesTitle: string;
  episode_number: string;
  episodeTitle: string;
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  missing_subtitles: SubLang[];
}

/** PATCH de subtítulos: 404 si Bazarr no conoce el elemento, 409 si no puede escribir el archivo (permisos o mapeo de rutas). */
async function patchSubtitles(call: ApiCall) {
  try {
    await apiRequest<unknown>("bazarr", { ...call, method: "PATCH" });
  } catch (e) {
    if (isApiError(e) && e.kind === "Http" && e.status === 404) throw new Error(t.subtitles.notFound);
    if (isApiError(e) && e.kind === "Http" && e.status === 409) throw new Error(t.subtitles.cannotWrite);
    throw e;
  }
}

/** Candidato de la búsqueda manual de Bazarr (`GET /providers/movies|episodes`). */
export interface SubtitleCandidate {
  provider: string;
  /** Identificador opaco que hay que devolver tal cual al descargarlo. */
  subtitle: string;
  language: string;
  forced: string;
  hearing_impaired: string;
  original_format?: string;
  score: number;
  orig_score?: number;
  release_info?: string[];
  matches?: string[];
  dont_matches?: string[];
  uploader?: string;
  url?: string;
}

export type ManualSubTarget = { kind: "movie"; radarrId: number } | { kind: "episode"; seriesId: number; episodeId: number };

/** Acciones del historial de Bazarr. */
export const HISTORY_ACTIONS = ["deleted", "downloaded", "manual", "upgraded", "uploaded", "synced", "translated"] as const;

export interface SubHistoryRecord {
  action: number;
  timestamp?: string;
  parsed_timestamp?: string;
  description?: string;
  language?: SubLang;
  provider?: string;
  score?: string;
  title?: string;
  seriesTitle?: string;
  episode_number?: string;
  episodeTitle?: string;
  radarrId?: number;
  sonarrEpisodeId?: number;
}

/** Estado de un proveedor activo según Bazarr (`GET /api/providers`). */
export interface ProviderStatus {
  name: string;
  /** "Good" o el motivo del bloqueo (TooManyRequests, AuthenticationError…). */
  status: string;
  /** Cuándo lo vuelve a usar, en inglés ("in 2 hours"); "-" si está bien. */
  retry: string;
}

/** Ajustes de Bazarr por secciones (`general`, `opensubtitlescom`…). Las contraseñas vienen en claro. */
export type BazarrSettings = Record<string, Record<string, unknown> | undefined>;

const ENABLED_KEY = "settings-general-enabled_providers";

/** Bazarr guarda una lista vacía si recibe el campo con un solo valor vacío. */
const listValue = (v: string[]) => (v.length ? v : [""]);

/** Un valor de ajuste como lo espera el formulario de Bazarr: listas repetidas, booleanos en minúscula. */
export function settingValue(v: unknown): string | string[] {
  if (Array.isArray(v)) return listValue(v.map(String));
  if (typeof v === "boolean") return v ? "true" : "false";
  return v == null ? "" : String(v);
}

/** Guarda solo los campos que se pasan (`settings-<sección>-<campo>`); el resto de ajustes no se toca. */
const saveSettings = (form: Record<string, string | string[]>) =>
  apiRequest<unknown>("bazarr", { method: "POST", path: "/api/system/settings", form });

const bool = (v: string | boolean | undefined) => (String(v).toLowerCase() === "true" ? "True" : "False");

const flags = (l: SubLang) => ({ language: l.code2, forced: String(!!l.forced), hi: String(!!l.hi) });

export const bazarr = {
  /** `{ object, issue }` de Bazarr, con la forma de los avisos de Radarr/Sonarr. */
  getHealth: async (): Promise<HealthItem[]> =>
    ((await apiRequest<{ data?: { object: string; issue: string }[] }>("bazarr", { path: "/api/system/health" })).data ?? []).map((h) => ({
      source: h.object,
      type: "warning" as const,
      message: h.object ? `${h.object}: ${h.issue}` : h.issue,
    })),
  getWantedMovies: async () =>
    (await apiRequest<{ data: WantedMovie[] }>("bazarr", { path: "/api/movies/wanted", query: { start: 0, length: -1 } })).data ?? [],
  getWantedEpisodes: async () =>
    (await apiRequest<{ data: WantedEpisode[] }>("bazarr", { path: "/api/episodes/wanted", query: { start: 0, length: -1 } })).data ?? [],
  /** Busca y descarga cada idioma que falta de una película. */
  searchMovie: async (m: WantedMovie) => {
    for (const l of m.missing_subtitles) {
      await patchSubtitles({ path: "/api/movies/subtitles", query: { radarrid: m.radarrId, ...flags(l) } });
    }
  },
  searchEpisode: async (e: WantedEpisode) => {
    for (const l of e.missing_subtitles) {
      await patchSubtitles({
        path: "/api/episodes/subtitles",
        query: { seriesid: e.sonarrSeriesId, episodeid: e.sonarrEpisodeId, ...flags(l) },
      });
    }
  },
  /** Busca en todos los proveedores sin descargar nada; puede tardar bastante. */
  manualSearch: async (target: ManualSubTarget) =>
    (
      await apiRequest<{ data?: SubtitleCandidate[] }>(
        "bazarr",
        target.kind === "movie"
          ? { path: "/api/providers/movies", query: { radarrid: target.radarrId } }
          : { path: "/api/providers/episodes", query: { episodeid: target.episodeId } },
      )
    ).data ?? [],
  downloadCandidate: (target: ManualSubTarget, c: SubtitleCandidate) =>
    apiRequest<unknown>("bazarr", {
      method: "POST",
      path: target.kind === "movie" ? "/api/providers/movies" : "/api/providers/episodes",
      query: {
        ...(target.kind === "movie" ? { radarrid: target.radarrId } : { seriesid: target.seriesId, episodeid: target.episodeId }),
        hi: bool(c.hearing_impaired),
        forced: bool(c.forced),
        original_format: bool(c.original_format),
        provider: c.provider,
        subtitle: c.subtitle,
      },
    }),
  getHistory: async (kind: "movies" | "episodes") =>
    (await apiRequest<{ data?: SubHistoryRecord[] }>("bazarr", { path: `/api/${kind}/history`, query: { start: 0, length: 100 } })).data ??
    [],
  getProviderStatus: async () => (await apiRequest<{ data?: ProviderStatus[] }>("bazarr", { path: "/api/providers" })).data ?? [],
  /** Quita los bloqueos temporales de todos los proveedores. */
  resetProviders: () => apiRequest<unknown>("bazarr", { method: "POST", path: "/api/providers", query: { action: "reset" } }),
  getSettings: () => apiRequest<BazarrSettings>("bazarr", { path: "/api/system/settings" }),
  setEnabledProviders: (keys: string[]) => saveSettings({ [ENABLED_KEY]: listValue(keys) }),
  /** Guarda los campos de un proveedor y, si se pide, lo deja activo en la misma llamada. */
  saveProvider: (key: string, values: Record<string, unknown>, enabled?: string[]) =>
    saveSettings({
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [`settings-${key}-${k}`, settingValue(v)])),
      ...(enabled ? { [ENABLED_KEY]: listValue(enabled) } : {}),
    }),
  searchAllWanted: async () => {
    await apiRequest<unknown>("bazarr", {
      method: "POST",
      path: "/api/system/tasks",
      query: { taskid: "wanted_search_missing_subtitles_movies" },
    });
    await apiRequest<unknown>("bazarr", {
      method: "POST",
      path: "/api/system/tasks",
      query: { taskid: "wanted_search_missing_subtitles_series" },
    });
  },
};

export function langLabel(l: SubLang) {
  return `${l.name}${l.forced ? " (forzados)" : ""}${l.hi ? " (SDH)" : ""}`;
}
