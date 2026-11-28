import type { QualityProfile, RootFolder } from "@/api/arr";
import { radarr, type Movie } from "@/api/radarr";
import { sonarr, type MonitorOption, type Series, type SeriesType } from "@/api/sonarr";
import { sendDealToQbit, type TrackerDeal } from "@/api/trackers";
import { apiRequest } from "@/lib/tauri";
import { defaultsFor, looksLikeAnime, movieDefaultsFor } from "@/lib/anime";
import { getPrefs } from "@/hooks/usePrefs";

export type DealKind = "movie" | "series";

/** Película o serie: por el TVDB (solo series lo tienen), un SxxEyy en el nombre o la categoría del tracker. */
export function dealKind(d: Pick<TrackerDeal, "name" | "category" | "tvdbId">): DealKind {
  if (d.tvdbId) return "series";
  if (/\bS\d{1,2}(E\d{1,3})?\b/i.test(d.name)) return "series";
  if (/tv|serie|anime|episod/i.test(d.category ?? "")) return "series";
  return "movie";
}

/** Qué ha pasado con Radarr/Sonarr al mandar un freeleech. */
export type ArrResult =
  | { service: "radarr" | "sonarr"; status: "added" | "existed"; title: string }
  | { service: "radarr" | "sonarr"; status: "notFound" | "notConfigured" | "failed"; error?: unknown };

interface DownloadClient {
  implementation?: string;
  enable?: boolean;
  fields?: { name: string; value?: unknown }[];
}

/** Categoría de qBittorrent que usa el *arr, para que importe él solo lo que se baje. */
async function arrCategory(service: "radarr" | "sonarr"): Promise<string | undefined> {
  try {
    const clients = await apiRequest<DownloadClient[]>(service, { path: "/api/v3/downloadclient" });
    const field = service === "radarr" ? "movieCategory" : "tvCategory";
    const qb = clients.find((c) => c.enable !== false && c.implementation === "QBittorrent");
    const v = qb?.fields?.find((f) => f.name === field)?.value;
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

const imdb = (n: number | null) => (n ? `tt${String(n).padStart(7, "0")}` : undefined);
const notConfigured = (e: unknown) => typeof e === "object" && e !== null && (e as { kind?: string }).kind === "NotConfigured";

/** Lo que hace falta para mandar un freeleech: si la película o serie ya está, o qué hay que elegir para añadirla. */
export type DealPlan =
  | Exclude<ArrResult, { status: "added" }>
  | {
      service: "radarr";
      status: "new";
      item: Movie;
      roots: RootFolder[];
      profiles: QualityProfile[];
      defaults: { rootFolderPath?: string; qualityProfileId?: number };
    }
  | {
      service: "sonarr";
      status: "new";
      item: Series;
      seriesType: SeriesType;
      roots: RootFolder[];
      profiles: QualityProfile[];
      defaults: { rootFolderPath?: string; qualityProfileId?: number };
    };

/** Carpeta, perfil (y en series tipo y seguimiento) que se eligen antes de añadir. */
export interface DealChoice {
  qualityProfileId: number;
  rootFolderPath: string;
  seriesType?: SeriesType;
  monitor?: MonitorOption;
}

async function planMovie(d: TrackerDeal): Promise<DealPlan> {
  const service = "radarr";
  try {
    const movies = await radarr.getMovies();
    const have = movies.find((m) => (d.tmdbId && m.tmdbId === d.tmdbId) || (d.imdbId && m.imdbId === imdb(d.imdbId)));
    if (have) return { service, status: "existed", title: have.title };
    const term = d.tmdbId ? `tmdb:${d.tmdbId}` : d.imdbId ? `imdb:${imdb(d.imdbId)}` : null;
    const found: Movie | undefined = term ? (await radarr.lookup(term))[0] : undefined;
    if (!found) return { service, status: "notFound" };
    const [roots, profiles] = await Promise.all([radarr.getRootFolders(), radarr.getQualityProfiles()]);
    const defaults = movieDefaultsFor(roots as RootFolder[], profiles as QualityProfile[], getPrefs().movieDefaults);
    return { service, status: "new", item: found, roots, profiles, defaults };
  } catch (e) {
    return { service, status: notConfigured(e) ? "notConfigured" : "failed", error: e };
  }
}

async function planSeries(d: TrackerDeal): Promise<DealPlan> {
  const service = "sonarr";
  try {
    const list = await sonarr.getSeries();
    const have = list.find(
      (s) => (d.tvdbId && s.tvdbId === d.tvdbId) || (d.imdbId && s.imdbId === imdb(d.imdbId)) || (d.tmdbId && s.tmdbId === d.tmdbId),
    );
    if (have) return { service, status: "existed", title: have.title };
    const terms = [d.tvdbId && `tvdb:${d.tvdbId}`, d.imdbId && `imdb:${imdb(d.imdbId)}`, d.tmdbId && `tmdb:${d.tmdbId}`].filter(
      (x): x is string => !!x,
    );
    let found: Series | undefined;
    for (const term of terms) {
      found = (await sonarr.lookup(term).catch(() => []))[0];
      if (found?.tvdbId) break;
    }
    if (!found?.tvdbId) return { service, status: "notFound" };
    const seriesType: SeriesType = looksLikeAnime(found) ? "anime" : found.seriesType === "daily" ? "daily" : "standard";
    const kind = seriesType === "anime" ? "anime" : "series";
    const [roots, profiles] = await Promise.all([sonarr.getRootFolders(), sonarr.getQualityProfiles()]);
    const defaults = defaultsFor(kind, roots, profiles, getPrefs().seriesDefaults[kind]);
    return { service, status: "new", item: found, seriesType, roots, profiles, defaults };
  } catch (e) {
    return { service, status: notConfigured(e) ? "notConfigured" : "failed", error: e };
  }
}

/** Mira en Radarr/Sonarr si el freeleech ya está; si no, busca la película o serie para que se elija carpeta y calidad. */
export function planDeal(d: TrackerDeal): Promise<DealPlan> {
  return dealKind(d) === "movie" ? planMovie(d) : planSeries(d);
}

async function addPlanned(plan: Extract<DealPlan, { status: "new" }>, c: DealChoice): Promise<ArrResult> {
  const service = plan.service;
  try {
    if (plan.service === "radarr") {
      const added = await radarr.addMovie(plan.item, {
        qualityProfileId: c.qualityProfileId,
        rootFolderPath: c.rootFolderPath,
        monitored: true,
        search: false,
      });
      return { service, status: "added", title: added.title ?? plan.item.title };
    }
    const added = await sonarr.addSeries(plan.item, {
      qualityProfileId: c.qualityProfileId,
      rootFolderPath: c.rootFolderPath,
      monitor: c.monitor ?? "all",
      seriesType: c.seriesType ?? plan.seriesType,
      search: false,
    });
    return { service, status: "added", title: added.title ?? plan.item.title };
  } catch (e) {
    return { service, status: "failed", error: e };
  }
}

/**
 * Manda un freeleech a qBittorrent y deja la película o serie en Radarr/Sonarr (la añade, sin buscar, con la carpeta
 * y calidad elegidas). Sin categoría elegida, usa la de Radarr/Sonarr en qBittorrent para que la importen al terminar.
 * Si falla lo de Radarr/Sonarr, el torrent se manda igual.
 */
export async function grabDeal(indexerId: number, d: TrackerDeal, plan: DealPlan, choice?: DealChoice, category?: string): Promise<ArrResult> {
  let arr: ArrResult;
  if (plan.status !== "new") arr = plan;
  else if (choice) arr = await addPlanned(plan, choice);
  else {
    const c = plan.defaults;
    arr =
      c.rootFolderPath && c.qualityProfileId
        ? await addPlanned(plan, { rootFolderPath: c.rootFolderPath, qualityProfileId: c.qualityProfileId })
        : { service: plan.service, status: "failed" };
  }
  const ok = arr.status === "added" || arr.status === "existed";
  const cat = category || (ok ? await arrCategory(arr.service) : undefined);
  await sendDealToQbit(indexerId, d, cat);
  return arr;
}
