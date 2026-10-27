import { parseConfigFile } from "./importConfig";

test("lee servicios conocidos con direcciones y secretos", () => {
  const r = parseConfigFile(
    JSON.stringify({
      services: {
        radarr: { localUrl: " http://h:7878 ", externalUrl: "https://movies.x.org", apiKey: "k1" },
        bazarr: { localUrl: "http://h:6767", apiKey: "PEGA_AQUI_BAZARR_KEY" },
        qbittorrent: { localUrl: "http://h:8080", username: "u", password: "p" },
        plex: { localUrl: "http://h:32400" },
        sonarr: { apiKey: "sin-url" },
      },
    }),
  );
  expect(r.map((s) => s.service)).toEqual(["radarr", "bazarr", "qbittorrent"]);
  expect(r[0]).toEqual({
    service: "radarr",
    config: { localUrl: "http://h:7878", externalUrl: "https://movies.x.org", enabled: true },
    secrets: { apiKey: "k1", username: undefined, password: undefined, proxyUsername: undefined, proxyPassword: undefined },
  });
  expect(r[1].secrets.apiKey).toBeUndefined();
  expect(r[2].secrets).toMatchObject({ username: "u", password: "p" });
});

test("errores claros", () => {
  expect(() => parseConfigFile("no json")).toThrow("no es un JSON válido");
  expect(() => parseConfigFile("{}")).toThrow('sección "services"');
  expect(() => parseConfigFile('{"services":{"plex":{}}}')).toThrow("ningún servicio");
});
