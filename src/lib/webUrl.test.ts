import { serviceWebUrl } from "./webUrl";

const cfg = (localUrl: string | null, externalUrl: string | null, enabled = true) => ({ localUrl, externalUrl, enabled });

test("usa la dirección externa si hay y, si no, la local", () => {
  expect(serviceWebUrl("radarr", cfg("http://h:7878", "https://movies.x.org"))).toBe("https://movies.x.org");
  expect(serviceWebUrl("radarr", cfg("http://h:7878", " "))).toBe("http://h:7878");
  expect(serviceWebUrl("radarr", cfg(null, null))).toBeNull();
  expect(serviceWebUrl("radarr", cfg("http://h:7878", null, false))).toBeNull();
  expect(serviceWebUrl("radarr", undefined)).toBeNull();
});

test("Plex abre su interfaz en /web", () => {
  expect(serviceWebUrl("plex", cfg("http://h:32400", null))).toBe("http://h:32400/web");
  expect(serviceWebUrl("plex", cfg("http://h:32400/", "https://plex.x.org/web/index.html"))).toBe("https://plex.x.org/web/index.html");
});
