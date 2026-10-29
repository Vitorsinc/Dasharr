import { posterUrl } from "./arr";
import { movieReleaseDate, type Movie } from "./radarr";
import type { Episode } from "./sonarr";

export interface CalItem {
  id: string;
  source: "radarr" | "sonarr";
  title: string;
  subtitle: string;
  date: Date;
  hasFile: boolean;
  poster?: string;
  movie?: Movie;
  episode?: Episode;
}

export function mergeCalendar(movies: Movie[], episodes: Episode[]): CalItem[] {
  const items: CalItem[] = [];
  for (const m of movies) {
    const d = movieReleaseDate(m);
    if (!d) continue;
    items.push({
      id: `m-${m.id}`,
      source: "radarr",
      title: m.title,
      subtitle: String(m.year),
      date: new Date(d),
      hasFile: m.hasFile,
      poster: posterUrl("radarr", m, 250),
      movie: m,
    });
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
      episode: e,
    });
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}
