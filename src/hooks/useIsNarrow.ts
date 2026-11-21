import { useSyncExternalStore } from "react";

/** Mismo corte que `md:` de Tailwind: por debajo se usa la disposición de móvil. */
export const NARROW_QUERY = "(max-width: 767.98px)";

function query() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(NARROW_QUERY) : null;
}

const subscribe = (cb: () => void) => {
  const q = query();
  q?.addEventListener("change", cb);
  return () => q?.removeEventListener("change", cb);
};

/** La ventana es estrecha (un móvil): menú inferior, diálogos a pantalla completa… */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
