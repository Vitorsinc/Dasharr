import { parseLog } from "./logs";

test("parseLog separa fecha, origen, nivel y mensaje", () => {
  const entries = parseLog([
    "[2026-10-28][18:30:01][dasharr_core::client][ERROR] bazarr GET /api/system/status -> credenciales incorrectas (12 ms)",
    "[2026-10-28][18:30:02][interfaz][WARN] Fallo en pantalla",
    "    at Componente",
    "basura sin formato al principio no rompe nada",
  ]);
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ date: "2026-10-28", time: "18:30:01", source: "Servicios", level: "ERROR" });
  expect(entries[1].message).toContain("at Componente");
});
