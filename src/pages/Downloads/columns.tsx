import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ProgressBar } from "@/components/ui";
import { t } from "@/i18n/es";
import { torrentGroup, type Torrent } from "@/api/qbit";
import { formatBytes, formatDateTime, formatEta, formatPercent, formatSpeed, trackerHost } from "@/lib/format";

/** Columnas opcionales de la tabla de Descargas (el nombre siempre se ve). */
export const DOWNLOAD_COLUMNS = [
  "size",
  "progress",
  "speed",
  "eta",
  "ratio",
  "uploaded",
  "peers",
  "category",
  "tracker",
  "added",
  "completed",
] as const;
export type DownloadColumn = (typeof DOWNLOAD_COLUMNS)[number];
/** Las de siempre: así se veía la tabla antes de poder elegir. */
export const DEFAULT_DOWNLOAD_COLUMNS: DownloadColumn[] = ["size", "progress", "speed", "eta"];

export type SortKey = "name" | DownloadColumn;
export interface DownloadSort {
  key: SortKey;
  dir: "asc" | "desc";
}
/** El orden que daba qBittorrent: lo último añadido arriba. */
export const DEFAULT_DOWNLOAD_SORT: DownloadSort = { key: "added", dir: "desc" };

export function isDownloadSort(v: unknown): v is DownloadSort {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (s.key === "name" || (DOWNLOAD_COLUMNS as readonly unknown[]).includes(s.key)) && (s.dir === "asc" || s.dir === "desc");
}

/** Lo guardado, sin columnas desconocidas ni repetidas, en el orden de la tabla. */
export function visibleColumns(stored: unknown): DownloadColumn[] {
  if (!Array.isArray(stored)) return DEFAULT_DOWNLOAD_COLUMNS;
  return DOWNLOAD_COLUMNS.filter((c) => stored.includes(c));
}

/** qBittorrent da 8640000 (100 días) cuando no sabe cuánto falta. */
const INFINITE_ETA = 8640000;
const etaValue = (tr: Torrent) => (tr.progress >= 1 ? 2e12 : tr.eta >= INFINITE_ETA || tr.eta < 0 ? 1e12 : tr.eta);
const text = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("es");

interface ColumnDef {
  /** Nombre en el selector y, si no hay `header`, en la cabecera. */
  label: string;
  header?: ReactNode;
  width: string;
  /** Valor por el que se ordena: números o texto. */
  value: (tr: Torrent) => number | string;
  /** Primer sentido al pulsar la cabecera: los números, de mayor a menor. */
  firstDir: "asc" | "desc";
  cell: (tr: Torrent) => ReactNode;
  className?: string;
}

const muted = "tabular-nums text-muted";

export const columnDefs: Record<DownloadColumn, ColumnDef> = {
  size: {
    label: t.downloads.size,
    width: "w-24",
    value: (tr) => tr.size,
    firstDir: "desc",
    cell: (tr) => formatBytes(tr.size),
    className: muted,
  },
  progress: {
    label: t.downloads.progress,
    width: "w-44",
    value: (tr) => tr.progress,
    firstDir: "desc",
    cell: (tr) => {
      const group = torrentGroup(tr);
      return (
        <>
          <div className="mb-1 text-xs tabular-nums">{formatPercent(tr.progress)}</div>
          <ProgressBar value={tr.progress} tone={group === "error" ? "danger" : tr.progress >= 1 ? "success" : "accent"} />
        </>
      );
    },
  },
  speed: {
    label: t.downloads.speed,
    header: (
      <>
        <ArrowDown className="inline h-3.5 w-3.5" aria-hidden /> / <ArrowUp className="inline h-3.5 w-3.5" aria-hidden />
      </>
    ),
    width: "w-28",
    // Primero lo que más baja; a igualdad, lo que más sube.
    value: (tr) => tr.dlspeed * 1e6 + tr.upspeed / 1e3,
    firstDir: "desc",
    cell: (tr) => (
      <>
        <div>{formatSpeed(tr.dlspeed)}</div>
        <div>{formatSpeed(tr.upspeed)}</div>
      </>
    ),
    className: "text-xs tabular-nums text-muted",
  },
  eta: {
    label: t.downloads.eta,
    width: "w-24",
    value: etaValue,
    firstDir: "asc",
    cell: (tr) => (tr.progress >= 1 ? "—" : formatEta(tr.eta)),
    className: muted,
  },
  ratio: {
    label: t.downloads.ratio,
    width: "w-20",
    value: (tr) => tr.ratio ?? 0,
    firstDir: "desc",
    cell: (tr) => (tr.ratio ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    className: muted,
  },
  uploaded: {
    label: t.downloads.uploaded,
    width: "w-24",
    value: (tr) => tr.uploaded ?? 0,
    firstDir: "desc",
    cell: (tr) => formatBytes(tr.uploaded ?? 0),
    className: muted,
  },
  peers: {
    label: t.downloads.peers,
    width: "w-28",
    value: (tr) => tr.num_seeds * 1e6 + (tr.num_leechs ?? 0),
    firstDir: "desc",
    cell: (tr) => `${tr.num_seeds} / ${tr.num_leechs ?? 0}`,
    className: muted,
  },
  category: {
    label: t.downloads.category,
    width: "w-28",
    value: (tr) => text(tr.category),
    firstDir: "asc",
    cell: (tr) => tr.category || "—",
    className: "truncate text-muted",
  },
  tracker: {
    label: t.torrent.tracker,
    width: "w-40",
    value: (tr) => text(trackerHost(tr.tracker)),
    firstDir: "asc",
    cell: (tr) => trackerHost(tr.tracker) ?? "—",
    className: "truncate text-muted",
  },
  added: {
    label: t.downloads.addedOn,
    width: "w-32",
    value: (tr) => tr.added_on ?? 0,
    firstDir: "desc",
    cell: (tr) => (tr.added_on > 0 ? formatDateTime(new Date(tr.added_on * 1000)) : "—"),
    className: "whitespace-nowrap tabular-nums text-muted",
  },
  completed: {
    label: t.downloads.completedOn,
    width: "w-32",
    value: (tr) => (tr.completion_on > 0 ? tr.completion_on : 0),
    firstDir: "desc",
    cell: (tr) => (tr.completion_on > 0 ? formatDateTime(new Date(tr.completion_on * 1000)) : "—"),
    className: "whitespace-nowrap tabular-nums text-muted",
  },
};

export function firstDir(key: SortKey): "asc" | "desc" {
  return key === "name" ? "asc" : columnDefs[key].firstDir;
}

/** Ordena sin tocar la lista original; a igualdad, por nombre. */
export function sortTorrents(list: Torrent[], sort: DownloadSort): Torrent[] {
  const value = sort.key === "name" ? (tr: Torrent) => text(tr.name) : columnDefs[sort.key].value;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const c =
      typeof va === "number" && typeof vb === "number"
        ? va === vb
          ? 0
          : va < vb
            ? -1
            : 1
        : String(va).localeCompare(String(vb), "es", { numeric: true });
    return c !== 0 ? c * sign : a.name.localeCompare(b.name, "es", { numeric: true });
  });
}
