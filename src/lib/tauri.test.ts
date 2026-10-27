import { invoke } from "@tauri-apps/api/core";
import { apiRequest } from "./tauri";
import { errorMessage } from "./errors";

const mockInvoke = vi.mocked(invoke);

test("apiRequest envía query, form y json con el formato del núcleo", async () => {
  mockInvoke.mockResolvedValueOnce([]);
  await apiRequest("radarr", { path: "/api/v3/movie/lookup", query: { term: "dune", skip: undefined } });
  expect(mockInvoke).toHaveBeenLastCalledWith("api_request", {
    service: "radarr",
    request: { method: "GET", path: "/api/v3/movie/lookup", query: [["term", "dune"]], body: null },
  });

  mockInvoke.mockResolvedValueOnce(null);
  await apiRequest("qbittorrent", { method: "POST", path: "/api/v2/torrents/stop", form: { hashes: "a|b" } });
  expect(mockInvoke).toHaveBeenLastCalledWith("api_request", {
    service: "qbittorrent",
    request: { method: "POST", path: "/api/v2/torrents/stop", query: [], body: { type: "form", value: [["hashes", "a|b"]] } },
  });
});

test("apiRequest propaga el error tipado y errorMessage lo traduce", async () => {
  mockInvoke.mockRejectedValueOnce({ kind: "Unauthorized" });
  const err = await apiRequest("radarr", { path: "/x" }).catch((e) => e);
  expect(errorMessage(err)).toBe("API key o credenciales incorrectas.");
  expect(errorMessage({ kind: "Http", status: 500, message: "boom" })).toBe("El servidor respondió con un error 500: boom");
});
