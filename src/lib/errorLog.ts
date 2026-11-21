import { useSyncExternalStore } from "react";

/**
 * Errores de esta sesión para la campanita junto al nombre de Dasharr. Los mismos errores repetidos (un servicio
 * caído que falla en cada refresco) se juntan en una sola entrada con un contador. Al marcar uno como leído se
 * quita y ya no vuelve a aparecer hasta que se cierre la app: solo vive en memoria.
 */
export interface ErrorEntry {
  id: string;
  /** Servicio o parte de la app que falló, si se sabe (p. ej. «Radarr»). */
  source?: string;
  message: string;
  count: number;
  firstAt: number;
  lastAt: number;
  /** Gravedad: los avisos de salud pueden ser solo advertencias o notas; el resto son errores. */
  level?: "error" | "warning" | "notice";
  /** Página de ayuda del aviso (la wiki de Servarr), si la hay. */
  link?: string;
}

/** Aviso de salud de un servicio (System → Status): sigue en la lista mientras el servicio lo dé. */
export interface HealthNotice {
  source: string;
  message: string;
  level: "error" | "warning" | "notice";
  link?: string;
}

/** Más que esto no cabe en la lista y no ayuda: se quitan los más antiguos. */
export const MAX_ERRORS = 50;

let entries: ErrorEntry[] = [];
let health: ErrorEntry[] = [];
/** Lo que se enseña: primero los avisos de salud (siguen activos), luego los errores, del último al primero. */
let shown: ErrorEntry[] = [];
const dismissed = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  shown = [...health, ...entries];
  listeners.forEach((l) => l());
};

export function errorId(source: string | undefined, message: string): string {
  return `${source ?? ""}\u0000${message}`;
}

/** Apunta un error en la campanita (si no se marcó ya como leído en esta sesión). */
export function reportError(message: string, source?: string, now = Date.now()) {
  const msg = message.trim();
  if (!msg) return;
  const id = errorId(source, msg);
  if (dismissed.has(id)) return;
  const prev = entries.find((e) => e.id === id);
  const entry: ErrorEntry = prev
    ? { ...prev, count: prev.count + 1, lastAt: now }
    : { id, source, message: msg, count: 1, firstAt: now, lastAt: now };
  // El más reciente arriba.
  entries = [entry, ...entries.filter((e) => e.id !== id)].slice(0, MAX_ERRORS);
  emit();
}

/**
 * Pone los avisos de salud actuales de los servicios. Los que desaparecen (ya resueltos) se quitan solos; los
 * marcados como leídos no vuelven en esta sesión.
 */
export function setHealthNotices(list: HealthNotice[], now = Date.now()) {
  const next = list
    .filter((h) => h.message.trim())
    .map((h): ErrorEntry => {
      const id = errorId(h.source, h.message.trim());
      const prev = health.find((e) => e.id === id);
      return { id, source: h.source, message: h.message.trim(), level: h.level, link: h.link, count: 1, firstAt: prev?.firstAt ?? now, lastAt: prev?.lastAt ?? now };
    })
    .filter((e, i, all) => !dismissed.has(e.id) && all.findIndex((o) => o.id === e.id) === i);
  const same = next.length === health.length && next.every((e, i) => e.id === health[i].id && e.level === health[i].level);
  if (same) return;
  health = next;
  emit();
}

export function markErrorRead(id: string) {
  dismissed.add(id);
  entries = entries.filter((e) => e.id !== id);
  health = health.filter((e) => e.id !== id);
  emit();
}

export function markAllErrorsRead() {
  shown.forEach((e) => dismissed.add(e.id));
  entries = [];
  health = [];
  emit();
}

export function getErrors(): ErrorEntry[] {
  return shown;
}

/** Solo para las pruebas: vuelve a empezar como si se abriera la app. */
export function resetErrors() {
  entries = [];
  health = [];
  dismissed.clear();
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useErrors(): ErrorEntry[] {
  return useSyncExternalStore(subscribe, getErrors, getErrors);
}
