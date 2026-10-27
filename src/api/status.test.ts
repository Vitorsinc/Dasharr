import { serviceVersion } from "./status";
import { mockBackend } from "@/test/utils";

test("serviceVersion tolera respuestas inesperadas", async () => {
  mockBackend({ api: { radarr: () => ({}), qbittorrent: () => [], bazarr: () => null, sonarr: () => ({ version: "4.0.1" }) } });
  expect(await serviceVersion("radarr")).toBe("?");
  expect(await serviceVersion("qbittorrent")).toBe("?");
  expect(await serviceVersion("bazarr")).toBe("?");
  expect(await serviceVersion("sonarr")).toBe("4.0.1");
});
