export type LibFilter = "all" | "downloaded" | "missing" | "monitored";
export type LibSort = "title" | "added" | "year";
export type LibState = "downloaded" | "missing" | "unmonitored" | "partial";

export interface LibItem {
  title: string;
  year?: number;
  added?: string;
  monitored: boolean;
  downloaded: boolean;
  missing: boolean;
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterSort<T extends LibItem>(items: T[], o: { query: string; filter: LibFilter; sort: LibSort }): T[] {
  const q = normalize(o.query.trim());
  const out = items.filter((i) => {
    if (q && !normalize(i.title).includes(q)) return false;
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
  const cmp: Record<LibSort, (a: T, b: T) => number> = {
    title: (a, b) => collator.compare(a.title, b.title),
    added: (a, b) => (b.added ?? "").localeCompare(a.added ?? ""),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  };
  return out.sort(cmp[o.sort]);
}

export function libState(i: LibItem): LibState {
  if (i.downloaded) return "downloaded";
  if (!i.monitored) return "unmonitored";
  if (i.missing) return "missing";
  return "partial";
}
