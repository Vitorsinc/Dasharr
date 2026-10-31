import { useEffect, useState } from "react";

/** Devuelve `value` cuando lleva `delay` ms sin cambiar (para búsquedas mientras se escribe). */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
