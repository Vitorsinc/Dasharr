import type { RootFolder, QualityProfile } from "@/api/arr";
import type { Series, SeriesType } from "@/api/sonarr";
import { t } from "@/i18n/es";

export type SeriesKind = "series" | "anime";

/** Cadenas japonesas y plataformas que emiten casi solo anime. */
const ANIME_NETWORKS = [
  "tokyo mx",
  "tv tokyo",
  "at-x",
  "bs11",
  "mbs",
  "fuji tv",
  "tbs",
  "nippon tv",
  "tv asahi",
  "abc tv (japan)",
  "nhk",
  "crunchyroll",
  "funimation",
  "animax",
];

type LookupMeta = Pick<Series, "genres" | "network" | "seriesType" | "originalLanguage">;

/**
 * Adivina si un resultado de búsqueda es anime con los datos que da Sonarr:
 * el género "Anime" de TVDB, o animación japonesa (idioma original o cadena).
 */
export function looksLikeAnime(s: LookupMeta): boolean {
  if (s.seriesType === "anime") return true;
  const genres = (s.genres ?? []).map((g) => g.toLowerCase());
  if (genres.includes("anime")) return true;
  if (!genres.includes("animation")) return false;
  if (s.originalLanguage?.name?.toLowerCase() === "japanese") return true;
  const network = s.network?.toLowerCase() ?? "";
  return ANIME_NETWORKS.some((n) => network === n || network.startsWith(`${n} `));
}

export const seriesTypeLabel: Record<SeriesType, string> = {
  standard: t.library.typeStandard,
  anime: t.library.typeAnime,
  daily: t.library.typeDaily,
};

export const isAnime = (s: Pick<Series, "seriesType">) => s.seriesType === "anime";
export const kindOf = (s: Pick<Series, "seriesType">): SeriesKind => (isAnime(s) ? "anime" : "series");
export const typeForKind = (k: SeriesKind): SeriesType => (k === "anime" ? "anime" : "standard");

const mentionsAnime = (s: string) => /anime/i.test(s);

/**
 * Carpeta y perfil por defecto para series o anime: lo elegido en Ajustes si sigue existiendo;
 * si no, para anime lo que se llame "anime" y para series lo primero que no.
 */
export function defaultsFor(
  kind: SeriesKind,
  roots: RootFolder[],
  profiles: QualityProfile[],
  saved?: { rootFolderPath?: string; qualityProfileId?: number },
) {
  const want = (name: string) => (kind === "anime" ? mentionsAnime(name) : !mentionsAnime(name));
  const root = roots.find((r) => r.path === saved?.rootFolderPath) ?? roots.find((r) => want(r.path)) ?? roots[0];
  const profile = profiles.find((p) => p.id === saved?.qualityProfileId) ?? profiles.find((p) => want(p.name)) ?? profiles[0];
  return { rootFolderPath: root?.path, qualityProfileId: profile?.id };
}

/** Carpeta y perfil de Radarr para añadir películas: lo guardado en Ajustes o, si no está, el primero disponible. */
export function movieDefaultsFor(
  roots: RootFolder[],
  profiles: QualityProfile[],
  saved?: { rootFolderPath?: string; qualityProfileId?: number },
) {
  const rs = Array.isArray(roots) ? roots : [];
  const ps = Array.isArray(profiles) ? profiles : [];
  const root = rs.find((r) => r.path === saved?.rootFolderPath) ?? rs[0];
  const profile = ps.find((p) => p.id === saved?.qualityProfileId) ?? ps[0];
  return { rootFolderPath: root?.path, qualityProfileId: profile?.id };
}
