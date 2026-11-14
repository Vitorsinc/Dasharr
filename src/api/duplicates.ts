import { apiRequest } from "@/lib/tauri";
import type { HistoryRecord, Paged } from "./arr";
import type { Torrent } from "./qbit";

type LibraryService = "radarr" | "sonarr";

/**
 * Qué pinta cada torrent de una película o serie con varias descargas:
 * - `current`: es de donde sale el archivo que hay ahora en la biblioteca (la última importación).
 * - `leftover`: el *arr ya importó después otra descarga para todo lo que traía (mejor idioma,
 *   calidad o puntuación); el torrent solo sigue sembrando y ocupando disco.
 * - `pending`: aún no se ha importado y no hay nada más nuevo (p. ej. una mejora que se está bajando).
 * - `orphan`: está en qBittorrent pero ni Radarr ni Sonarr lo tienen en su historial.
 */
export type DuplicateRole = "current" | "leftover" | "pending" | "orphan";

export interface SeedGoal {
  /** `true` si ya sembró lo mínimo de su tracker o, si no hay mínimo, llegó al límite que tiene en qBittorrent. */
  met: boolean;
  /** De dónde sale el objetivo: el mínimo fijado en Ajustes para su tracker o los límites de qBittorrent. */
  source: "tracker" | "qbit";
  /** Segundos que faltan para el tiempo mínimo (si lo hay y no se ha cumplido por ratio). */
  remainingSecs?: number;
  ratio?: number;
  /** Minutos. */
  minutes?: number;
}

export interface DuplicateTorrent {
  torrent: Torrent;
  role: DuplicateRole;
  /** Indexador por el que se bajó (del historial del *arr), si se sabe. */
  indexer?: string;
  quality?: string;
  grabbedAt?: string;
  importedAt?: string;
  /** Episodios que trae, solo en series: «1x03», «1x01–1x08» o «T1–T2 · 20 ep.». */
  episodes?: string;
}

export interface Duplicates {
  groups: DuplicateGroup[];
  /** Torrents completos que ningún *arr reconoce; vacío si no se pidió o el historial no llegó entero. */
  orphans: DuplicateTorrent[];
}

export interface DuplicateGroup {
  key: string;
  service: LibraryService;
  title: string;
  items: DuplicateTorrent[];
  /** Tamaño de los sobrantes (para ordenar; lo que se libera de verdad depende de los archivos compartidos). */
  leftoverSize: number;
}

const HISTORY_PAGE = 1000;
const MAX_PAGES = 30;
/** `eventType` de «grabbed» y «downloadFolderImported» (iguales en Radarr y Sonarr). */
const GRABBED = 1;
const IMPORTED = 3;

export interface ArrHistory {
  records: HistoryRecord[];
  /** `false` si había tanto historial que no se leyó entero: no se puede decir que un torrent no esté en él. */
  complete: boolean;
}

/**
 * Historial de un tipo de evento, de lo más nuevo a lo más viejo, hasta `sinceMs`: los torrents se
 * añadieron a qBittorrent después de que el *arr los cogiera, así que lo anterior no hace falta.
 */
async function historySince(service: LibraryService, eventType: number, sinceMs: number): Promise<ArrHistory> {
  const out: HistoryRecord[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiRequest<Paged<HistoryRecord>>(service, {
      path: "/api/v3/history",
      query: {
        page,
        pageSize: HISTORY_PAGE,
        sortKey: "date",
        sortDirection: "descending",
        eventType,
        ...(service === "radarr" ? { includeMovie: true } : { includeSeries: true, includeEpisode: true }),
      },
    });
    const records = res?.records ?? [];
    out.push(...records);
    const last = records[records.length - 1];
    if (records.length < HISTORY_PAGE || !last || Date.parse(last.date) < sinceMs) return { records: out, complete: true };
  }
  return { records: out, complete: false };
}

/** Descargas e importaciones del *arr que pueden tocar a los torrents que hay en qBittorrent. */
export async function arrDownloadHistory(service: LibraryService, torrents: Torrent[]): Promise<ArrHistory> {
  if (torrents.length === 0) return { records: [], complete: true };
  // Un día de margen por relojes distintos entre máquinas.
  const since = Math.min(...torrents.map((t) => t.added_on * 1000)) - 86_400_000;
  const [grabs, imports] = await Promise.all([historySince(service, GRABBED, since), historySince(service, IMPORTED, since)]);
  return { records: [...grabs.records, ...imports.records], complete: grabs.complete && imports.complete };
}

/**
 * Si el torrent ya sembró lo suficiente. Con un mínimo de días para su tracker (Ajustes) manda ese
 * tiempo; si no, los límites de qBittorrent (ratio o tiempo, lo primero que llegue). Sin ninguno
 * de los dos no se sabe: `undefined`.
 */
export function seedGoal(t: Torrent, minDays?: number): SeedGoal | undefined {
  const seeded = t.seeding_time ?? 0;
  if (minDays != null && minDays > 0) {
    const minutes = Math.round(minDays * 1440);
    const met = seeded >= minutes * 60;
    return { met, source: "tracker", minutes, ...(!met && { remainingSecs: minutes * 60 - seeded }) };
  }
  const ratio = t.max_ratio ?? -1;
  const minutes = t.max_seeding_time ?? -1;
  if (!(ratio > 0) && !(minutes > 0)) return undefined;
  const byRatio = ratio > 0 && t.ratio >= ratio;
  const byTime = minutes > 0 && seeded >= minutes * 60;
  const met = byRatio || byTime;
  return {
    met,
    source: "qbit",
    ...(ratio > 0 && { ratio }),
    ...(minutes > 0 && { minutes }),
    ...(!met && minutes > 0 && { remainingSecs: minutes * 60 - seeded }),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function episodesLabel(eps: { season: number; episode: number }[]): string | undefined {
  if (eps.length === 0) return undefined;
  const sorted = [...eps].sort((a, b) => a.season - b.season || a.episode - b.episode);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return `${first.season}x${pad(first.episode)}`;
  if (first.season === last.season) return `${first.season}x${pad(first.episode)}–${first.season}x${pad(last.episode)}`;
  return `T${first.season}–T${last.season} · ${sorted.length} ep.`;
}

interface Acc {
  hash: string;
  service: LibraryService;
  groupKey: string;
  title: string;
  grabbedAt?: string;
  indexer?: string;
  quality?: string;
  /** Unidad (película o episodio) → fecha de la importación de este torrent. */
  imports: Map<number, string>;
  grabbed: Set<number>;
  episodes: Map<number, { season: number; episode: number }>;
}

const newer = (a: string | undefined, b: string | undefined) => (a ?? "") > (b ?? "");

/**
 * Cruza los torrents de qBittorrent con el historial de Radarr y Sonarr (por el `downloadId`, que es
 * el hash) y devuelve las películas y series que tienen más de un torrent con alguno sobrante.
 * Con `orphans`, también los torrents completos que no salen en ningún historial; solo tiene sentido
 * si el historial de todos los *arr configurados llegó entero.
 */
export function findDuplicates(
  torrents: Torrent[],
  history: { service: LibraryService; records: HistoryRecord[] }[],
  opts: { orphans?: boolean } = {},
): Duplicates {
  const byHash = new Map(torrents.map((t) => [t.hash.toLowerCase(), t]));
  const accs = new Map<string, Acc>();
  const known = new Set<string>();

  for (const { service, records } of history) {
    for (const r of records) {
      const hash = r.downloadId?.trim().toLowerCase();
      if (!hash || !byHash.has(hash)) continue;
      known.add(hash);
      const itemId = service === "radarr" ? r.movieId : r.seriesId;
      const unit = service === "radarr" ? r.movieId : r.episodeId;
      if (itemId == null || unit == null) continue;
      const groupKey = `${service}:${itemId}`;
      const key = `${groupKey}:${hash}`;
      let a = accs.get(key);
      if (!a) {
        a = { hash, service, groupKey, title: "", imports: new Map(), grabbed: new Set(), episodes: new Map() };
        accs.set(key, a);
      }
      const title =
        service === "radarr" ? r.movie?.title && (r.movie.year ? `${r.movie.title} (${r.movie.year})` : r.movie.title) : r.series?.title;
      if (title) a.title = title;
      if (r.episode) a.episodes.set(unit, { season: r.episode.seasonNumber, episode: r.episode.episodeNumber });
      const quality = r.quality?.quality?.name;
      const grabbed = r.eventType === "grabbed" || r.eventType === String(GRABBED);
      if (grabbed) {
        a.grabbed.add(unit);
        if (!a.grabbedAt || r.date < a.grabbedAt) a.grabbedAt = r.date;
        a.indexer ??= r.data?.indexer || undefined;
        if (quality) a.quality = quality;
      } else {
        if (newer(r.date, a.imports.get(unit))) a.imports.set(unit, r.date);
        if (quality && !a.quality) a.quality = quality;
      }
    }
  }

  const groups = new Map<string, Acc[]>();
  for (const a of accs.values()) groups.set(a.groupKey, [...(groups.get(a.groupKey) ?? []), a]);

  const out: DuplicateGroup[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    // La última importación de cada película o episodio y de qué torrent vino.
    const latest = new Map<number, { hash: string; date: string }>();
    for (const m of members) for (const [u, d] of m.imports) if (newer(d, latest.get(u)?.date)) latest.set(u, { hash: m.hash, date: d });

    const items: DuplicateTorrent[] = members.map((m) => {
      const units = m.imports.size ? [...m.imports.keys()] : [...m.grabbed];
      const isCurrent = units.some((u) => latest.get(u)?.hash === m.hash);
      const replaced =
        units.length > 0 &&
        units.every((u) => {
          const l = latest.get(u);
          return !!l && l.hash !== m.hash && newer(l.date, m.imports.get(u) ?? m.grabbedAt);
        });
      const role: DuplicateRole = isCurrent ? "current" : replaced ? "leftover" : "pending";
      const torrent = byHash.get(m.hash)!;
      const importedAt = [...m.imports.values()].sort().pop();
      return {
        torrent,
        role,
        indexer: m.indexer,
        quality: m.quality,
        grabbedAt: m.grabbedAt,
        importedAt,
        episodes: m.service === "sonarr" ? episodesLabel(units.flatMap((u) => m.episodes.get(u) ?? [])) : undefined,
      };
    });
    if (!items.some((i) => i.role === "leftover")) continue;
    const order: Record<DuplicateRole, number> = { current: 0, pending: 1, leftover: 2, orphan: 3 };
    items.sort(
      (a, b) => order[a.role] - order[b.role] || (b.importedAt ?? b.grabbedAt ?? "").localeCompare(a.importedAt ?? a.grabbedAt ?? ""),
    );
    out.push({
      key,
      service: members[0].service,
      title: members.find((m) => m.title)?.title ?? members[0].hash,
      items,
      leftoverSize: items.filter((i) => i.role === "leftover").reduce((s, i) => s + i.torrent.size, 0),
    });
  }
  const orphans: DuplicateTorrent[] = opts.orphans
    ? torrents
        .filter((t) => t.progress >= 1 && !known.has(t.hash.toLowerCase()))
        .sort((a, b) => b.size - a.size)
        .map((torrent) => ({ torrent, role: "orphan" }))
    : [];
  return { groups: out.sort((a, b) => b.leftoverSize - a.leftoverSize || a.title.localeCompare(b.title, "es")), orphans };
}

/** Nombre corto del tracker a partir de su URL de announce: «tracker.example.org». */
export function trackerHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^(www|tracker|announce)\./, "") || undefined;
  } catch {
    return undefined;
  }
}
