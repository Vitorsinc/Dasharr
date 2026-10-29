import { t } from "@/i18n/es";
import { apiRequest, type ApiCall } from "@/lib/tauri";
import { isApiError } from "@/lib/types";

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

const flags = (l: SubLang) => ({ language: l.code2, forced: String(!!l.forced), hi: String(!!l.hi) });

export const bazarr = {
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
