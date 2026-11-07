import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { requestableSeasons, type TvDetails } from "@/api/seerr";

const user = (id: number, displayName: string) => ({ id, displayName, email: `${displayName}@x`, requestCount: 2 });
const pending = {
  id: 7,
  status: 1,
  type: "movie",
  is4k: false,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  media: { id: 3, tmdbId: 603, status: 2, mediaType: "movie" },
  requestedBy: user(2, "Ana"),
};
const tvDetails: TvDetails = {
  id: 1399,
  name: "Juego de tronos",
  seasons: [
    { id: 0, seasonNumber: 0, name: "Especiales", episodeCount: 3 },
    { id: 1, seasonNumber: 1, name: "T1", episodeCount: 10 },
    { id: 2, seasonNumber: 2, name: "T2", episodeCount: 10 },
    { id: 3, seasonNumber: 3, name: "T3", episodeCount: 10 },
  ],
  externalIds: { tvdbId: 121361 },
  mediaInfo: {
    id: 9,
    tmdbId: 1399,
    status: 4,
    seasons: [{ seasonNumber: 1, status: 5 }],
    requests: [{ id: 1, status: 2, type: "tv", is4k: false, createdAt: "", updatedAt: "", media: {} as never, seasons: [{ seasonNumber: 2, status: 2 }] }],
  },
};

function seerrApi(calls: { method: string; path: string; body: any; query: [string, string][] }[]) {
  return (req: { method: string; path: string; query: [string, string][]; body: any }) => {
    calls.push(req);
    const p = req.path;
    if (p === "/api/v1/request" && req.method === "GET") return { pageInfo: { page: 1, pages: 1, results: 1 }, results: [pending] };
    if (p === "/api/v1/request" && req.method === "POST") return { id: 99 };
    if (p === "/api/v1/request/count") return { total: 5, movie: 3, tv: 2, pending: 1, approved: 2, declined: 0, processing: 1, available: 1 };
    if (p.startsWith("/api/v1/request/")) return pending;
    if (p === "/api/v1/movie/603")
      return { id: 603, title: "Matrix", releaseDate: "1999-03-31", posterPath: "/m.jpg", mediaInfo: { id: 3, tmdbId: 603, status: 2, requests: [pending] } };
    if (p === "/api/v1/tv/1399") return tvDetails;
    if (p === "/api/v1/search") return { page: 1, totalPages: 1, totalResults: 1, results: [{ id: 1399, mediaType: "tv", name: "Juego de tronos", firstAirDate: "2011-04-17" }] };
    if (p.startsWith("/api/v1/discover")) return { page: 1, totalPages: 1, totalResults: 0, results: [] };
    if (p === "/api/v1/service/sonarr" || p === "/api/v1/service/radarr") return [];
    if (p === "/api/v1/user") return { pageInfo: { page: 1, pages: 1, results: 2 }, results: [user(1, "Vitor"), user(2, "Ana")] };
    if (p === "/api/v1/auth/me") return user(1, "Vitor");
    if (p.endsWith("/quota")) return { movie: { used: 1, limit: 5, days: 7, restricted: false }, tv: { used: 0, restricted: false } };
    if (p === "/api/v1/status") return { version: "3.0.1" };
    throw { kind: "Http", status: 404, message: p };
  };
}

test("temporadas que se pueden pedir: sin especiales, ni disponibles ni ya pedidas", () => {
  expect(requestableSeasons(tvDetails).map((s) => [s.season.seasonNumber, s.state])).toEqual([
    [1, "available"],
    [2, "requested"],
    [3, "free"],
  ]);
});

test("solicitudes pendientes: se ve quién la pidió y se aprueba", async () => {
  const calls: any[] = [];
  mockBackend({ api: { seerr: seerrApi(calls) } });
  renderApp("/solicitudes");
  expect(await screen.findByText("Matrix")).toBeInTheDocument();
  expect(screen.getByText(/Pedida por Ana/)).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Pendientes/ })).toHaveAttribute("aria-selected", "true");
  await userEvent.click(screen.getByRole("button", { name: "Aprobar: Matrix" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/request/7/approve")).toBe(true));
  const list = calls.find((c) => c.path === "/api/v1/request" && c.method === "GET");
  expect(Object.fromEntries(list.query)).toMatchObject({ filter: "pending", take: "20", skip: "0" });
});

test("descubrir: buscar una serie y pedir solo las temporadas que faltan", async () => {
  const calls: any[] = [];
  mockBackend({ api: { seerr: seerrApi(calls) } });
  renderApp("/descubrir");
  await userEvent.type(screen.getByRole("textbox", { name: "Buscar en Seerr" }), "tronos");
  await userEvent.click(await screen.findByRole("button", { name: "Juego de tronos" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("checkbox", { name: /Temporada 3/ })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: /Temporada 1/ })).toBeDisabled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Solicitar" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/request")).toBe(true));
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v1/request");
  expect(post.body.value).toMatchObject({ mediaType: "tv", mediaId: 1399, tvdbId: 121361, seasons: [3], is4k: false });
});
