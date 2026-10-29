import { apiRequest } from "@/lib/tauri";
import type { ArrService } from "./arr";

/** Respuesta de `GET /api/v3/diskspace` de Radarr y Sonarr. */
export interface ArrDiskSpace {
  path: string;
  label?: string;
  freeSpace: number;
  totalSpace: number;
}

export type DiskSource = ArrService | "qbittorrent";

export interface Disk {
  /** Rutas (dentro del servidor o contenedor) que están en este disco. */
  paths: string[];
  label?: string;
  free: number;
  /** Desconocido si solo lo informa qBittorrent (solo da el espacio libre). */
  total?: number;
  sources: DiskSource[];
}

export const getDiskSpace = (service: ArrService) => apiRequest<ArrDiskSpace[]>(service, { path: "/api/v3/diskspace" });

/** Rutas de sistema que no interesan como nombre del disco (configuración y archivos que Docker monta). */
const SYSTEM_PATH = /^\/(config|etc|app|run|proc|sys|dev)?(\/|$)/i;

/** Dos lecturas del mismo disco: mismo tamaño y espacio libre casi igual (se leen en momentos distintos). */
function sameDisk(free: number, total: number | undefined, d: Disk) {
  const tolerance = Math.max(total ?? 0, d.total ?? 0, free, d.free) * 0.005;
  if (total != null && d.total != null && total !== d.total) return false;
  return Math.abs(free - d.free) <= tolerance;
}

/**
 * Junta los discos que informan Radarr, Sonarr y qBittorrent. Como suelen estar en Docker, el mismo
 * disco aparece con varias rutas (`/`, `/config`, `/data`…): se agrupan por tamaño y espacio libre.
 */
export function mergeDisks(arr: { service: ArrService; disks: ArrDiskSpace[] | undefined }[], qbitFree: number | undefined): Disk[] {
  const disks: Disk[] = [];
  // Cuántos servicios ven cada ruta: la compartida (p. ej. `/data`) es mejor nombre que `/tv` o `/movies`.
  const seen = new Map<string, number>();
  for (const { service, disks: list } of arr) {
    for (const x of Array.isArray(list) ? list : []) {
      if (typeof x?.totalSpace !== "number" || typeof x.freeSpace !== "number" || x.totalSpace <= 0) continue;
      seen.set(x.path, (seen.get(x.path) ?? 0) + 1);
      const d = disks.find((d) => sameDisk(x.freeSpace, x.totalSpace, d));
      if (d) {
        if (!d.paths.includes(x.path)) d.paths.push(x.path);
        if (!d.sources.includes(service)) d.sources.push(service);
        d.label ||= x.label || undefined;
      } else {
        disks.push({ paths: [x.path], label: x.label || undefined, free: x.freeSpace, total: x.totalSpace, sources: [service] });
      }
    }
  }
  if (typeof qbitFree === "number" && qbitFree >= 0) {
    const d = disks.find((d) => sameDisk(qbitFree, undefined, d));
    if (d) {
      if (!d.sources.includes("qbittorrent")) d.sources.push("qbittorrent");
    } else disks.push({ paths: [], free: qbitFree, sources: ["qbittorrent"] });
  }
  for (const d of disks)
    d.paths.sort(
      (a, b) => Number(SYSTEM_PATH.test(a)) - Number(SYSTEM_PATH.test(b)) || (seen.get(b) ?? 0) - (seen.get(a) ?? 0) || a.length - b.length,
    );
  // Los discos con contenido primero; el del sistema (solo `/`, `/config`…) al final.
  return disks.sort((a, b) => Number(isSystemDisk(a)) - Number(isSystemDisk(b)) || (b.total ?? 0) - (a.total ?? 0));
}

export function isSystemDisk(d: Disk) {
  return d.paths.length > 0 && d.paths.every((p) => SYSTEM_PATH.test(p));
}
