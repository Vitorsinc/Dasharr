import { useCallback } from "react";
import { getPrefs, usePrefs } from "./usePrefs";

/**
 * Orden elegido en una pantalla, guardado en las preferencias (localStorage) bajo `key`.
 * Si lo guardado ya no es válido según `isValid` (o no hay nada), se usa `fallback`.
 */
export function usePersistedSort<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): [T, (v: T | ((prev: T) => T)) => void] {
  const [prefs, setPrefs] = usePrefs();
  const stored = prefs.sorts?.[key];
  const value = isValid(stored) ? stored : fallback;
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      // Se lee de las preferencias actuales para que dos cambios seguidos no se pisen.
      const sorts = (getSorts() ?? {}) as Record<string, unknown>;
      const current = isValid(sorts[key]) ? (sorts[key] as T) : fallback;
      const v = typeof next === "function" ? (next as (p: T) => T)(current) : next;
      setPrefs({ sorts: { ...sorts, [key]: v } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, setPrefs],
  );
  return [value, set];
}

function getSorts() {
  return getPrefs().sorts;
}

/** Validador para uniones de cadenas: acepta solo las opciones indicadas. */
export const oneOf =
  <T extends string>(options: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (options as readonly string[]).includes(v);
