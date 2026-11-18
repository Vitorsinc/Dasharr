import { apiRequest } from "@/lib/tauri";
import { isApiError } from "@/lib/types";

/*
 * Beszel (monitor de servidores) guarda sus datos en PocketBase: cada equipo con agente es un registro de
 * `systems`, con un resumen en `info`; las medidas completas del último minuto están en `system_stats`
 * (type = "1m") y los datos fijos (sistema operativo, CPU, memoria total) en `system_details` (0.15+).
 * Los nombres de campo son de una o dos letras: ver internal/entities/system/system.go en henrygd/beszel.
 */

const GB = 1024 ** 3;

/** Resumen de `systems.info`. Las versiones antiguas traen aquí también nombre de equipo, kernel y CPU. */
interface RawInfo {
  h?: string;
  k?: string;
  c?: number;
  t?: number;
  m?: string;
  u?: number;
  cpu?: number;
  mp?: number;
  dp?: number;
  /** MB/s (agentes antiguos). */
  b?: number;
  /** Bytes/s. */
  bb?: number;
  v?: string;
  g?: number;
  dt?: number;
  os?: number;
  la?: number[];
  efs?: Record<string, number>;
  rdn?: string;
}

interface RawSystem {
  id: string;
  name: string;
  status: string;
  host?: string;
  info?: RawInfo | null;
  updated?: string;
}

interface RawStats {
  cpu?: number;
  /** GB (obsoletos, siguen llegando por compatibilidad). */
  m?: number;
  mu?: number;
  mp?: number;
  s?: number;
  su?: number;
  d?: number;
  du?: number;
  dp?: number;
  /** [total, usada, búfer/caché, ARC de ZFS] en bytes (agentes nuevos). */
  mem?: number[];
  /** [total, usada] en bytes. */
  swap?: number[];
  t?: Record<string, number>;
  efs?: Record<string, { d?: number; du?: number }>;
  g?: Record<string, { n?: string; u?: number; mu?: number; mt?: number; p?: number }>;
  /** [enviados, recibidos] en bytes/s. */
  b?: number[];
  /** MB/s (agentes antiguos). */
  ns?: number;
  nr?: number;
  la?: number[];
}

interface RawDetails {
  hostname?: string;
  kernel?: string;
  cores?: number;
  threads?: number;
  cpu?: string;
  os?: number;
  os_name?: string;
  arch?: string;
  memory?: number;
}

export type SystemStatus = "up" | "down" | "paused" | "pending";

export interface Usage {
  /** 0–100. */
  pct: number;
  /** Bytes; null si Beszel no lo da. */
  used: number | null;
  total: number | null;
}

export interface ServerSystem {
  id: string;
  name: string;
  status: SystemStatus;
  hostname: string | null;
  /** «Ubuntu 24.04 · 6.8.0-49-generic · x86_64». */
  os: string | null;
  cpuModel: string | null;
  cores: number | null;
  threads: number | null;
  uptime: number | null;
  cpu: number | null;
  memory: Usage | null;
  swap: Usage | null;
  disk: Usage | null;
  /** Discos y particiones extra (FILESYSTEM/EXTRA_FILESYSTEMS del agente). */
  disks: { name: string; usage: Usage }[];
  /** Temperatura que Beszel enseña en su panel (°C). */
  temp: number | null;
  sensors: { name: string; temp: number }[];
  gpu: number | null;
  load: number[] | null;
  /** Bytes/s. */
  netUp: number | null;
  netDown: number | null;
  /** Suma de subida y bajada, del resumen. */
  net: number | null;
  agent: string | null;
  updated: string | null;
}

interface List<T> {
  items: T[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const STATUSES: SystemStatus[] = ["up", "down", "paused", "pending"];
const OS_NAMES = ["Linux", "macOS", "Windows", "FreeBSD"];

function usage(pct: number | null | undefined, used: number | null, total: number | null): Usage | null {
  const p = num(pct) ?? (used != null && total ? (used / total) * 100 : null);
  if (p == null) return null;
  return { pct: Math.min(100, Math.max(0, p)), used, total };
}

/** Une el resumen de `systems`, las medidas del último minuto y los datos fijos del equipo. */
export function toServerSystem(sys: RawSystem, stats: RawStats | null, details: RawDetails | null): ServerSystem {
  const info = sys.info ?? {};
  const s = stats ?? {};
  const memTotal = num(s.mem?.[0]) ?? (num(s.m) != null ? s.m! * GB : null) ?? num(details?.memory);
  const memUsed = num(s.mem?.[1]) ?? (num(s.mu) != null ? s.mu! * GB : null);
  const swapTotal = num(s.swap?.[0]) ?? (num(s.s) != null ? s.s! * GB : null);
  const swapUsed = num(s.swap?.[1]) ?? (num(s.su) != null ? s.su! * GB : null);
  const diskTotal = num(s.d) != null ? s.d! * GB : null;
  const diskUsed = num(s.du) != null ? s.du! * GB : null;

  const disks: ServerSystem["disks"] = [];
  const names = new Set([...Object.keys(s.efs ?? {}), ...Object.keys(info.efs ?? {})]);
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const fs = s.efs?.[name];
    const total = num(fs?.d) != null ? fs!.d! * GB : null;
    const used = num(fs?.du) != null ? fs!.du! * GB : null;
    const u = usage(info.efs?.[name], used, total);
    if (u) disks.push({ name, usage: u });
  }

  const sensors = Object.entries(s.t ?? {})
    .filter(([, v]) => num(v) != null && v > 0)
    .map(([name, temp]) => ({ name, temp }))
    .sort((a, b) => b.temp - a.temp);
  const gpus = Object.values(s.g ?? {})
    .map((g) => num(g.u))
    .filter((u): u is number => u != null);

  const osName = text(details?.os_name) ?? (info.os != null ? OS_NAMES[info.os] ?? null : details?.os != null ? OS_NAMES[details.os] ?? null : null);
  const kernel = text(details?.kernel) ?? text(info.k);
  const os = [osName, kernel, text(details?.arch)].filter(Boolean).join(" · ") || null;
  const load = (s.la ?? info.la)?.filter((v) => num(v) != null) ?? null;
  const bw = s.b && s.b.length === 2 ? s.b : null;

  return {
    id: sys.id,
    name: sys.name,
    status: STATUSES.includes(sys.status as SystemStatus) ? (sys.status as SystemStatus) : "pending",
    hostname: text(details?.hostname) ?? text(info.h),
    os,
    cpuModel: text(details?.cpu) ?? text(info.m),
    cores: num(details?.cores) ?? num(info.c),
    threads: num(details?.threads) ?? num(info.t),
    uptime: num(info.u),
    cpu: num(info.cpu) ?? num(s.cpu),
    memory: usage(info.mp ?? s.mp, memUsed, memTotal),
    swap: swapTotal ? usage(null, swapUsed ?? 0, swapTotal) : null,
    disk: usage(info.dp ?? s.dp, diskUsed, diskTotal),
    disks,
    temp: num(info.dt) ?? sensors[0]?.temp ?? null,
    sensors,
    gpu: num(info.g) ?? (gpus.length ? Math.max(...gpus) : null),
    load: load && load.length ? load : null,
    netUp: bw ? bw[0] : num(s.ns) != null ? s.ns! * 1024 * 1024 : null,
    netDown: bw ? bw[1] : num(s.nr) != null ? s.nr! * 1024 * 1024 : null,
    net: num(info.bb) ?? (num(info.b) != null ? info.b! * 1024 * 1024 : null),
    agent: text(info.v),
    updated: text(sys.updated),
  };
}

const notFound = (e: unknown) => isApiError(e) && e.kind === "Http" && e.status === 404;

async function latestStats(id: string): Promise<RawStats | null> {
  const res = await apiRequest<List<{ stats?: RawStats }>>("beszel", {
    path: "/api/collections/system_stats/records",
    query: { filter: `system='${id}' && type='1m'`, sort: "-created", perPage: "1", skipTotal: "1", fields: "stats" },
  });
  return res?.items?.[0]?.stats ?? null;
}

async function details(id: string): Promise<RawDetails | null> {
  try {
    return await apiRequest<RawDetails>("beszel", { path: `/api/collections/system_details/records/${encodeURIComponent(id)}` });
  } catch (e) {
    // Beszel anterior a 0.15 no tiene `system_details`: los datos vienen en `info`.
    if (notFound(e)) return null;
    throw e;
  }
}

export const beszel = {
  /** Los equipos que ve la cuenta, con sus medidas más recientes. */
  async systems(): Promise<ServerSystem[]> {
    const res = await apiRequest<List<RawSystem>>("beszel", {
      path: "/api/collections/systems/records",
      query: { sort: "name", perPage: "100", skipTotal: "1" },
    });
    const items = (res?.items ?? []).filter((s) => s && typeof s.id === "string");
    return Promise.all(
      items.map(async (sys) => {
        // Si un equipo está caído o en pausa no hay medidas nuevas que pedir.
        const live = sys.status === "up";
        const [stats, det] = await Promise.all([
          live ? latestStats(sys.id).catch(() => null) : Promise.resolve(null),
          details(sys.id).catch(() => null),
        ]);
        return toServerSystem(sys, stats, det);
      }),
    );
  },
};
