import { beforeEach, describe, expect, it } from "vitest";
import { getErrors, markAllErrorsRead, markErrorRead, MAX_ERRORS, reportError, resetErrors, setHealthNotices } from "./errorLog";

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

describe("avisos de salud", () => {
  beforeEach(resetErrors);

  it("siguen mientras el servicio los dé y lo leído no vuelve", () => {
    const disco = { source: "Radarr", message: "Poco espacio", level: "warning" as const };
    const idx = { source: "Prowlarr", message: "Indexador caído", level: "error" as const, link: "https://wiki" };
    reportError("Sin conexión", "Bazarr");
    setHealthNotices([disco, idx]);
    expect(getErrors().map((e) => e.message)).toEqual(["Poco espacio", "Indexador caído", "Sin conexión"]);
    // Resuelto en el servicio: desaparece solo.
    setHealthNotices([idx]);
    expect(getErrors().map((e) => e.message)).toEqual(["Indexador caído", "Sin conexión"]);
    markErrorRead(getErrors()[0].id);
    setHealthNotices([idx, disco]);
    expect(getErrors().map((e) => e.message)).toEqual(["Poco espacio", "Sin conexión"]);
    markAllErrorsRead();
    setHealthNotices([idx, disco]);
    expect(getErrors()).toEqual([]);
  });
});
