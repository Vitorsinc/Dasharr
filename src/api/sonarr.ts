import { apiRequest } from "@/lib/tauri";
import { arrCommon, type ArrImage } from "./arr";

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
  images?: ArrImage[];
  seasons?: Season[];
  genres?: string[];
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
  series?: Series;
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
  searchSeries: (seriesId: number) => common.command({ name: "SeriesSearch", seriesId }),
  searchSeason: (seriesId: number, seasonNumber: number) => common.command({ name: "SeasonSearch", seriesId, seasonNumber }),
  searchEpisodes: (episodeIds: number[]) => common.command({ name: "EpisodeSearch", episodeIds }),
  getCalendar: (start: Date, end: Date) =>
    apiRequest<Episode[]>("sonarr", {
      path: "/api/v3/calendar",
      query: { start: start.toISOString(), end: end.toISOString(), includeSeries: true, unmonitored: false },
    }),
};
