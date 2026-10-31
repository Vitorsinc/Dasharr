import { backdropUrl, posterUrl } from "./arr";
import { t } from "@/i18n/es";
import { movieReleases, type MovieReleases, type ReleaseKind } from "@/lib/releases";
import type { Movie } from "./radarr";
import type { Episode } from "./sonarr";

export interface CalItem {
  id: string;
  source: "radarr" | "sonarr";
  title: string;
  subtitle: string;
  date: Date;
  hasFile: boolean;
  poster?: string;
  /** Imagen de fondo de la barra del calendario (fanart o póster). */
  backdrop?: string;
  movie?: Movie;
  /** En películas, qué estreno es: en cines, digital o física. */
  release?: ReleaseKind;
  episode?: Episode;
}

export interface CalendarOptions {
  /** Fechas de cada película; por defecto las de Radarr. */
  releasesOf?: (m: Movie) => MovieReleases;
  /** Solo los estrenos de películas en [start, end). */
  start?: Date;
  end?: Date;
}

/** Estrenos de una película que van al calendario: en cines y digital; la física solo si no hay digital. */
function calendarReleases(r: MovieReleases): ReleaseKind[] {
  const kinds: ReleaseKind[] = ["cinema", r.digital ? "digital" : "physical"];
  return kinds.filter((k) => r[k]);
}

export function mergeCalendar(movies: Movie[], episodes: Episode[], opts: CalendarOptions = {}): CalItem[] {
  const items: CalItem[] = [];
  const { releasesOf = (m: Movie) => movieReleases(m), start, end } = opts;
  for (const m of movies) {
    const r = releasesOf(m);
    for (const kind of calendarReleases(r)) {
      const date = r[kind]!;
      if ((start && date < start) || (end && date >= end)) continue;
      items.push({
        id: `m-${m.id}-${kind}`,
        source: "radarr",
        title: m.title,
        subtitle: `${t.premieres.kind[kind]} · ${m.year}`,
        date,
        hasFile: m.hasFile,
        poster: posterUrl("radarr", m, 250),
        backdrop: backdropUrl("radarr", m),
        movie: m,
        release: kind,
      });
    }
  }
  for (const e of episodes) {
    if (!e.airDateUtc) continue;
    const code = `${e.seasonNumber}x${String(e.episodeNumber).padStart(2, "0")}`;
    items.push({
      id: `e-${e.id}`,
      source: "sonarr",
      title: e.series?.title ?? e.title,
      subtitle: `${code} · ${e.title}`,
      date: new Date(e.airDateUtc),
      hasFile: e.hasFile,
      poster: e.series ? posterUrl("sonarr", e.series, 250) : undefined,
      backdrop: e.series ? backdropUrl("sonarr", e.series) : undefined,
      episode: e,
    });
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}
