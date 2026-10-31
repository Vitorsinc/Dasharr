import { act, renderHook } from "@testing-library/react";
import { getPrefs, setPrefs } from "./usePrefs";
import { oneOf, usePersistedSort } from "./usePersistedSort";

const valid = oneOf(["title", "year"] as const);

beforeEach(() => setPrefs({ sorts: {} }));

test("devuelve el valor por defecto si no hay nada guardado", () => {
  const { result } = renderHook(() => usePersistedSort("t1", "title" as "title" | "year", valid));
  expect(result.current[0]).toBe("title");
});

test("guarda el cambio en las preferencias y lo recupera al montar de nuevo", () => {
  const first = renderHook(() => usePersistedSort("t2", "title" as "title" | "year", valid));
  act(() => first.result.current[1]("year"));
  expect(first.result.current[0]).toBe("year");
  expect(getPrefs().sorts.t2).toBe("year");
  expect(JSON.parse(localStorage.getItem("dasharr.prefs")!).sorts.t2).toBe("year");
  first.unmount();
  const second = renderHook(() => usePersistedSort("t2", "title" as "title" | "year", valid));
  expect(second.result.current[0]).toBe("year");
});

test("una clave no afecta a las demás", () => {
  const a = renderHook(() => usePersistedSort("a", "title" as "title" | "year", valid));
  const b = renderHook(() => usePersistedSort("b", "title" as "title" | "year", valid));
  act(() => a.result.current[1]("year"));
  expect(b.result.current[0]).toBe("title");
});

test("un valor guardado que ya no es válido cae al de por defecto", () => {
  setPrefs({ sorts: { t3: "rating:imdb" } });
  const { result } = renderHook(() => usePersistedSort("t3", "title" as "title" | "year", valid));
  expect(result.current[0]).toBe("title");
});

test("acepta una función para calcular el nuevo valor", () => {
  const { result } = renderHook(() => usePersistedSort("t4", "title" as "title" | "year", valid));
  act(() => result.current[1]((p) => (p === "title" ? "year" : "title")));
  expect(result.current[0]).toBe("year");
});

test("tolera que sorts esté corrupto en las preferencias", () => {
  setPrefs({ sorts: "basura" as any });
  const { result } = renderHook(() => usePersistedSort("t5", "title" as "title" | "year", valid));
  expect(result.current[0]).toBe("title");
  act(() => result.current[1]("year"));
  expect(result.current[0]).toBe("year");
});
