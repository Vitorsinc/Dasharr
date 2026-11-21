import { beforeEach, describe, expect, it } from "vitest";
import { getErrors, markAllErrorsRead, markErrorRead, MAX_ERRORS, reportError, resetErrors } from "./errorLog";

describe("errorLog", () => {
  beforeEach(resetErrors);

  it("junta los errores repetidos y deja el último arriba", () => {
    reportError("Sin conexión", "Radarr", 1);
    reportError("Clave incorrecta", "Sonarr", 2);
    reportError("Sin conexión", "Radarr", 3);
    expect(getErrors().map((e) => [e.source, e.count, e.lastAt])).toEqual([
      ["Radarr", 2, 3],
      ["Sonarr", 1, 2],
    ]);
  });

  it("lo marcado como leído no vuelve en la sesión", () => {
    reportError("Sin conexión", "Radarr");
    markErrorRead(getErrors()[0].id);
    reportError("Sin conexión", "Radarr");
    expect(getErrors()).toEqual([]);
    // Un error distinto sí aparece.
    reportError("Sin conexión", "Sonarr");
    expect(getErrors()).toHaveLength(1);
    markAllErrorsRead();
    reportError("Sin conexión", "Sonarr");
    expect(getErrors()).toEqual([]);
  });

  it("ignora mensajes vacíos y no crece sin límite", () => {
    reportError("  ");
    for (let i = 0; i < MAX_ERRORS + 5; i++) reportError(`e${i}`);
    expect(getErrors()).toHaveLength(MAX_ERRORS);
    expect(getErrors()[0].message).toBe(`e${MAX_ERRORS + 4}`);
  });
});
