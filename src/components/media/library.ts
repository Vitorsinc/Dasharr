import { RATING_SOURCES, type RatingSource } from "@/hooks/usePrefs";

export type LibFilter = "all" | "downloaded" | "missing" | "monitored";
export type LibSort = "title" | "added" | "year" | `rating:${RatingSource}`;
export function isLibSort(v: unknown): v is LibSort {
  if (typeof v !== "string") return false;
  if (v === "title" || v === "added" || v === "year") return true;
  return v.startsWith("rating:") && (RATING_SOURCES as readonly string[]).includes(v.slice("rating:".length));
}
/** Notas de un elemento por fuente (Rotten Tomatoes y Metacritic en %, el resto sobre 10). */
export type Scores = Partial<Record<RatingSource, number>>;
export type LibState = "downloaded" | "missing" | "unmonitored" | "partial";

export interface LibItem {
  title: string;
  year?: number;
  added?: string;
  monitored: boolean;
  downloaded: boolean;
  missing: boolean;
  scores?: Scores;
  tags?: number[];
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterSort<T extends LibItem>(
  items: T[],
  o: { query: string; filter: LibFilter; sort: LibSort; /** Solo las que llevan esta etiqueta. */ tag?: number | null },
): T[] {
  const q = normalize(o.query.trim());
  const out = items.filter((i) => {
    if (q && !normalize(i.title).includes(q)) return false;
    if (o.tag != null && !i.tags?.includes(o.tag)) return false;
    switch (o.filter) {
      case "downloaded":
        return i.downloaded;
      case "missing":
        return i.missing;
      case "monitored":
        return i.monitored;
      default:
        return true;
    }
  });
  const byTitle = (a: T, b: T) => collator.compare(a.title, b.title);
  if (o.sort.startsWith("rating:")) {
    const source = o.sort.slice("rating:".length) as RatingSource;
    // De mayor a menor nota; las que aún no tienen nota, al final por título.
    return out.sort((a, b) => {
      const x = a.scores?.[source];
      const y = b.scores?.[source];
      if (x == null || y == null) return x == null && y == null ? byTitle(a, b) : x == null ? 1 : -1;
      return y - x || byTitle(a, b);
    });
  }
  const cmp: Record<"title" | "added" | "year", (a: T, b: T) => number> = {
    title: byTitle,
    added: (a, b) => (b.added ?? "").localeCompare(a.added ?? ""),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  };
  return out.sort(cmp[o.sort as "title" | "added" | "year"]);
}

export function libState(i: LibItem): LibState {
  if (i.downloaded) return "downloaded";
  if (!i.monitored) return "unmonitored";
  if (i.missing) return "missing";
  return "partial";
}

/** Notas por las que se puede ordenar cada biblioteca. */
export const MOVIE_SOURCES: RatingSource[] = ["filmaffinity", "imdb", "tmdb", "rottenTomatoes", "metacritic", "trakt"];
export const SERIES_SOURCES: RatingSource[] = ["filmaffinity", "tvdb"];

/** Si la nota del orden elegido se ha ocultado en Ajustes, se vuelve a ordenar por título. */
export function isAvailable(sort: LibSort, sources: RatingSource[]) {
  return !sort.startsWith("rating:") || sources.includes(sort.slice("rating:".length) as RatingSource);
}

/** Orden en que se piden las notas de FilmAffinity: el de la lista, salvo al ordenar por nota (por título). */
export function fetchOrder(sort: LibSort): LibSort {
  return sort.startsWith("rating:") ? "title" : sort;
}
