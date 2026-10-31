import type { Movie } from "@/api/radarr";
import type { CountryReleaseDates } from "@/api/tmdb";

export type ReleaseKind = "cinema" | "digital" | "physical";
export const RELEASE_KINDS: ReleaseKind[] = ["cinema", "digital", "physical"];

export type MovieReleases = Partial<Record<ReleaseKind, Date>>;

/** Día de estreno a medianoche local: `2025-03-01` y `2025-03-01T00:00:00Z` caen el mismo día en cualquier zona. */
export function parseDay(s: string | null | undefined): Date | undefined {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** Fechas de Radarr, completadas con las del país elegido cuando TMDB las tiene. */
export function movieReleases(m: Movie, country?: CountryReleaseDates): MovieReleases {
  const radarr: Record<ReleaseKind, string | undefined> = {
    cinema: m.inCinemas,
    digital: m.digitalRelease,
    physical: m.physicalRelease,
  };
  const out: MovieReleases = {};
  for (const k of RELEASE_KINDS) {
    const d = parseDay(country?.[k] ?? radarr[k]);
    if (d) out[k] = d;
  }
  return out;
}

/** Estrenos desde `from` (incluido), del más cercano al más lejano. */
export function nextReleases(r: MovieReleases, from: Date): { kind: ReleaseKind; date: Date }[] {
  return RELEASE_KINDS.flatMap((kind) => (r[kind] && r[kind]! >= from ? [{ kind, date: r[kind]! }] : [])).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/** Películas que merece la pena preguntar a TMDB: las que aún pueden tener algún estreno por delante. */
export function mayHaveUpcoming(m: Movie, now = new Date()): boolean {
  if (m.status && m.status !== "released") return true;
  const dates = [m.inCinemas, m.digitalRelease, m.physicalRelease].map(parseDay).filter(Boolean) as Date[];
  if (!dates.length) return m.year >= now.getFullYear() - 1;
  // El estreno en otro país puede llegar meses después que en el de Radarr.
  const since = new Date(now.getFullYear(), now.getMonth() - 8, now.getDate());
  return dates.some((d) => d >= since);
}
