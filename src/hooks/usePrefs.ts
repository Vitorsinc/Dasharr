import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";
export interface Prefs {
  theme: Theme;
  notifications: boolean;
}

const KEY = "dasharr.prefs";
const DEFAULTS: Prefs = { theme: "dark", notifications: true };
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function setPrefs(patch: Partial<Prefs>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sin almacenamiento: se mantiene en memoria */
  }
  listeners.forEach((l) => l());
}

export function getPrefs(): Prefs {
  return read();
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    read,
  );
  return [prefs, useCallback(setPrefs, [])];
}

/** Aplica el tema elegido a <html>. */
export function useApplyTheme() {
  const [{ theme }] = usePrefs();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [theme]);
}
