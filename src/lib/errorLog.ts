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
}

/** Más que esto no cabe en la lista y no ayuda: se quitan los más antiguos. */
export const MAX_ERRORS = 50;

let entries: ErrorEntry[] = [];
const dismissed = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

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

export function markErrorRead(id: string) {
  dismissed.add(id);
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export function markAllErrorsRead() {
  entries.forEach((e) => dismissed.add(e.id));
  entries = [];
  emit();
}

export function getErrors(): ErrorEntry[] {
  return entries;
}

/** Solo para las pruebas: vuelve a empezar como si se abriera la app. */
export function resetErrors() {
  entries = [];
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
