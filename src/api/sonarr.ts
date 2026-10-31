import { apiRequest } from "@/lib/tauri";
import { arrCommon, type ArrImage, type ArrRating, type HistoryRecord, type WantedKind } from "./arr";

export interface SeasonStats {
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
}
export interface Season {
  seasonNumber: number;
  monitored: boolean;
  statistics?: SeasonStats;
}
export type SeriesType = "standard" | "anime" | "daily";
export interface Series {
  id: number;
  title: string;
  year: number;
  overview?: string;
  monitored: boolean;
  status?: string;
  network?: string;
  added?: string;
  tvdbId: number;
  tmdbId?: number;
  imdbId?: string;
  qualityProfileId?: number;
  path?: string;
  rootFolderPath?: string;
  images?: ArrImage[];
  seasons?: Season[];
  genres?: string[];
  ratings?: ArrRating;
  seriesType?: SeriesType;
  originalLanguage?: { id: number; name: string };
  statistics?: SeasonStats & { seasonCount?: number; percentOfEpisodes?: number };
}
export interface Episode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc?: string;
  hasFile: boolean;
  monitored: boolean;
  episodeFileId?: number;
  episodeFile?: EpisodeFile;
  series?: Series;
}
export interface EpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath?: string;
  size: number;
  quality?: { quality?: { name?: string } };
  languages?: { name: string }[];
}
/** Vista previa de `GET /rename`: archivos cuyo nombre no sigue el formato configurado en Sonarr. */
export interface RenamePreview {
  episodeFileId: number;
  seasonNumber: number;
  episodeNumbers: number[];
  existingPath: string;
  newPath: string;
}

/** Opciones del menú "Monitorizar" de Sonarr (seasonpass). "none" deja la serie sin monitorizar. */
export type MonitorChange = "all" | "future" | "missing" | "existing" | "firstSeason" | "lastSeason" | "pilot" | "none";

export interface SeriesEdit {
  qualityProfileId: number;
  path: string;
  moveFiles: boolean;
  /** undefined = no cambiar qué episodios están monitorizados. */
  monitor?: MonitorChange;
}

export type MonitorOption = "all" | "future" | "latestSeason";
export interface AddSeriesOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  monitor: MonitorOption;
  seriesType: SeriesType;
  search: boolean;
}

export type EpisodeStatus = "downloaded" | "missing" | "unaired";
export function episodeStatus(e: Pick<Episode, "hasFile" | "airDateUtc">, now = new Date()): EpisodeStatus {
  if (e.hasFile) return "downloaded";
  if (!e.airDateUtc || new Date(e.airDateUtc) > now) return "unaired";
  return "missing";
}

const common = arrCommon("sonarr");

/** Sonarr v3 exige languageProfileId; v4 ya no lo usa. */
async function languageProfileId(): Promise<number | undefined> {
  try {
    const list = await apiRequest<{ id: number }[]>("sonarr", { path: "/api/v3/languageprofile" });
    return Array.isArray(list) ? list[0]?.id : undefined;
  } catch {
    return undefined;
  }
}

export const sonarr = {
  ...common,
  getSeries: () => apiRequest<Series[]>("sonarr", { path: "/api/v3/series" }),
  getEpisodes: (seriesId: number) => apiRequest<Episode[]>("sonarr", { path: "/api/v3/episode", query: { seriesId } }),
  lookup: (term: string) => apiRequest<Series[]>("sonarr", { path: "/api/v3/series/lookup", query: { term } }),
  addSeries: async (series: Series, o: AddSeriesOptions) =>
    apiRequest<Series>("sonarr", {
      method: "POST",
      path: "/api/v3/series",
      json: {
        ...series,
        id: undefined,
        qualityProfileId: o.qualityProfileId,
        languageProfileId: await languageProfileId(),
        rootFolderPath: o.rootFolderPath,
        monitored: true,
        seasonFolder: true,
        seriesType: o.seriesType,
        addOptions: { monitor: o.monitor, searchForMissingEpisodes: o.search },
      },
    }),
  setMonitored: (series: Series, monitored: boolean) =>
    apiRequest<Series>("sonarr", { method: "PUT", path: `/api/v3/series/${series.id}`, json: { ...series, monitored } }),
  setSeriesType: (series: Series, seriesType: SeriesType) =>
    apiRequest<Series>("sonarr", { method: "PUT", path: `/api/v3/series/${series.id}`, json: { ...series, seriesType } }),
  setEpisodesMonitored: (episodeIds: number[], monitored: boolean) =>
    apiRequest<unknown>("sonarr", { method: "PUT", path: "/api/v3/episode/monitor", json: { episodeIds, monitored } }),
  deleteSeries: (id: number, deleteFiles: boolean) =>
    apiRequest<unknown>("sonarr", {
      method: "DELETE",
      path: `/api/v3/series/${id}`,
      query: { deleteFiles, addImportListExclusion: false },
    }),
  updateSeries: async (series: Series, e: SeriesEdit) => {
    await apiRequest<Series>("sonarr", {
      method: "PUT",
      path: `/api/v3/series/${series.id}`,
      query: { moveFiles: e.moveFiles && e.path !== series.path },
      json: { ...series, qualityProfileId: e.qualityProfileId, path: e.path },
    });
    if (e.monitor)
      await apiRequest<unknown>("sonarr", {
        method: "POST",
        path: "/api/v3/seasonpass",
        json: { series: [{ id: series.id, monitored: e.monitor !== "none" }], monitoringOptions: { monitor: e.monitor } },
      });
  },
  /** Al cambiar la temporada, Sonarr marca o desmarca también todos sus episodios. */
  setSeasonMonitored: (series: Series, seasonNumber: number, monitored: boolean) =>
    apiRequest<Series>("sonarr", {
      method: "PUT",
      path: `/api/v3/series/${series.id}`,
      json: { ...series, seasons: (series.seasons ?? []).map((s) => (s.seasonNumber === seasonNumber ? { ...s, monitored } : s)) },
    }),
  getEpisodeFiles: (seriesId: number) => apiRequest<EpisodeFile[]>("sonarr", { path: "/api/v3/episodefile", query: { seriesId } }),
  deleteEpisodeFile: (id: number) => apiRequest<unknown>("sonarr", { method: "DELETE", path: `/api/v3/episodefile/${id}` }),
  getRenamePreview: (seriesId: number) => apiRequest<RenamePreview[]>("sonarr", { path: "/api/v3/rename", query: { seriesId } }),
  renameFiles: (seriesId: number, files: number[]) => common.command({ name: "RenameFiles", seriesId, files }),
  /** Actualiza los datos de la serie (episodios nuevos, fechas, imágenes) desde TheTVDB y reescanea el disco. */
  refreshSeries: (seriesId: number) => common.command({ name: "RefreshSeries", seriesId }),
  /** Vuelve a leer la carpeta de la serie para detectar archivos añadidos o borrados a mano. */
  rescanSeries: (seriesId: number) => common.command({ name: "RescanSeries", seriesId }),
  getHistory: (seriesId: number) =>
    apiRequest<HistoryRecord[]>("sonarr", { path: "/api/v3/history/series", query: { seriesId, includeEpisode: true } }).then((l) =>
      [...l].sort((a, b) => b.date.localeCompare(a.date)),
    ),
  getWanted: async (kind: WantedKind) => (await common.getWanted<Episode>(kind)).records ?? [],
  searchSeries: (seriesId: number) => common.command({ name: "SeriesSearch", seriesId }),
  searchSeason: (seriesId: number, seasonNumber: number) => common.command({ name: "SeasonSearch", seriesId, seasonNumber }),
  searchEpisodes: (episodeIds: number[]) => common.command({ name: "EpisodeSearch", episodeIds }),
  getCalendar: (start: Date, end: Date) =>
    apiRequest<Episode[]>("sonarr", {
      path: "/api/v3/calendar",
      query: { start: start.toISOString(), end: end.toISOString(), includeSeries: true, unmonitored: false },
    }),
};
