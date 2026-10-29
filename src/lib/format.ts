const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const nfRating = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat("es-ES");
const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : nf1.format(v)} ${UNITS[i]}`;
}

export function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

/** qBittorrent usa 8640000 para "infinito". */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0 || seconds >= 8640000) return "∞";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatPercent(fraction: number): string {
  return `${nf1.format(Math.max(0, Math.min(1, fraction)) * 100)} %`;
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFmt.format(date);
}

/** Antigüedad relativa a partir de una fecha ("hace 3 d"). */
export function formatAge(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const secs = (now.getTime() - date.getTime()) / 1000;
  if (!Number.isFinite(secs)) return "—";
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h`;
  if (secs < 86400 * 365) return `${Math.round(secs / 86400)} d`;
  return `${nf1.format(secs / (86400 * 365))} años`;
}

/** Nota sobre 10 con una cifra decimal: 7,8. */
export function formatRating(n: number): string {
  return nfRating.format(n);
}

export function formatCount(n: number): string {
  return nfInt.format(n);
}
