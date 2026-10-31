import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { allConfigured, mockBackend, renderApp } from "@/test/utils";
import { movieRefs, playsByEpisode, showRefs, viewers, type Play } from "@/api/tracearr";

const ana = { id: "u1", server_user_id: "su1", username: "Ana", avatar_url: null };
const luis = { id: "u2", server_user_id: "su2", username: "Luis", avatar_url: null };

function play(p: Partial<Play>): Play {
  return {
    id: Math.random().toString(36),
    server_name: "Plex",
    media_type: "movie",
    media_title: "Dune",
    show_title: null,
    season_number: null,
    episode_number: null,
    year: 2021,
    poster_url: null,
    duration_ms: 3_600_000,
    percent_complete: 100,
    started_at: "2026-10-20T20:00:00Z",
    stopped_at: null,
    watched: true,
    device: "Salón",
    player: "Plex for LG",
    product: null,
    platform: null,
    is_transcode: false,
    tmdb_id: 10,
    tvdb_id: null,
    imdb_id: null,
    user: ana,
    ...p,
  };
}

const ep = (season: number, episode: number, p: Partial<Play> = {}) =>
  play({ media_type: "episode", show_title: "Shōgun", media_title: `Ep ${episode}`, season_number: season, episode_number: episode, ...p });

test("referencias de Tracearr por ID", () => {
  expect(movieRefs({ tmdbId: 10, imdbId: "tt1" })).toEqual(["movie:tmdb:10", "movie:imdb:tt1"]);
  expect(showRefs({ tvdbId: 70 })).toEqual(["show:tvdb:70"]);
});

test("agrupa por persona y por episodio", () => {
  const plays = [
    ep(1, 1, { started_at: "2026-10-01T00:00:00Z" }),
    ep(1, 1, { user: luis, watched: false, percent_complete: 40, started_at: "2026-10-28T00:00:00Z" }),
    ep(1, 2),
  ];
  const vs = viewers(plays);
  expect(vs.map((v) => v.user.username)).toEqual(["Luis", "Ana"]);
  expect(vs[1].plays).toHaveLength(2);
  expect(playsByEpisode(plays).get("1x1")).toHaveLength(2);
});

test("la ficha de una película muestra quién la ha visto y cuándo; prueba el IMDb si el TMDB no existe", async () => {
  const calls: string[] = [];
  mockBackend({
    api: {
      radarr: (req) =>
        req.path === "/api/v3/movie"
          ? [{ id: 1, title: "Dune", year: 2021, tmdbId: 10, imdbId: "tt1", hasFile: true, monitored: true, images: [] }]
          : {},
      tracearr: (req) => {
        calls.push(req.path);
        if (req.path.includes("movie:tmdb")) throw { kind: "Http", status: 404, message: "" };
        return {
          data: [play({ user: luis, watched: false, percent_complete: 35, started_at: "2026-10-25T21:00:00Z" }), play({})],
          meta: { nextCursor: null, pageSize: 100 },
        };
      },
    },
  });
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune (2021)" });
  const seen = await within(dialog).findByRole("region", { name: "Visto por" });
  expect(within(seen).getByText("Ana")).toBeInTheDocument();
  expect(within(seen).getByText("Luis")).toBeInTheDocument();
  expect(within(seen).getByText("35%")).toBeInTheDocument();
  expect(within(seen).getByText("2 personas")).toBeInTheDocument();
  expect(calls).toEqual(["/api/v2/public/media/movie:tmdb:10/history", "/api/v2/public/media/movie:imdb:tt1/history"]);
});

test("la ficha de una serie muestra quién ha visto cada episodio", async () => {
  mockBackend({
    api: {
      sonarr: (req) => {
        if (req.path === "/api/v3/series") return [{ id: 7, title: "Shōgun", year: 2024, tvdbId: 70, monitored: true, images: [] }];
        if (req.path === "/api/v3/episode")
          return [
            { id: 101, seriesId: 7, seasonNumber: 1, episodeNumber: 1, title: "Anjin", hasFile: true, monitored: true },
            { id: 102, seriesId: 7, seasonNumber: 1, episodeNumber: 2, title: "Servants", hasFile: true, monitored: true },
          ];
        return [];
      },
      tracearr: (req) => {
        expect(req.path).toBe("/api/v2/public/media/show:tvdb:70/history");
        return { data: [ep(1, 1), ep(1, 1, { user: luis, started_at: "2026-10-26T22:00:00Z" })], meta: { nextCursor: null } };
      },
    },
  });
  renderApp("/series");
  await userEvent.click(await screen.findByRole("button", { name: "Shōgun" }));
  const dialog = await screen.findByRole("dialog", { name: "Shōgun" });
  expect(await within(dialog).findByText("2 personas")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByText("Temporada 1"));
  const btn = within(dialog).getByRole("button", { name: "Visto por Ana, Luis" });
  await userEvent.click(btn);
  expect(within(dialog).getAllByText("Plex for LG")).toHaveLength(2);
});

test("menú Historial: lista, filtros y lo que se está viendo ahora (sin Plex, según Tracearr)", async () => {
  const requests: any[] = [];
  const { plex: _plex, ...withoutPlex } = allConfigured();
  mockBackend({
    settings: withoutPlex as ReturnType<typeof allConfigured>,
    api: {
      tracearr: (req) => {
        requests.push(req);
        if (req.path === "/api/v2/public/users")
          return { data: [{ id: "u1", username: "ana", identity_name: "Ana" }], meta: { nextCursor: null } };
        if (req.path === "/api/v2/public/streams")
          return {
            data: [
              {
                id: "s1",
                server_name: "Plex",
                username: "Luis",
                media_type: "episode",
                media_title: "Anjin",
                show_title: "Shōgun",
                season_number: 1,
                episode_number: 1,
                year: 2024,
                poster_url: null,
                duration_ms: 100,
                progress_ms: 50,
                state: "playing",
                started_at: "2026-10-29T10:00:00Z",
                device: "TV",
                player: "Plex for LG",
                product: null,
                is_transcode: true,
              },
            ],
          };
        if (req.path === "/api/v2/public/history")
          return { data: [play({}), ep(1, 3, { user: luis })], meta: { nextCursor: null, pageSize: 50 } };
        return {};
      },
    },
  });
  renderApp("/historial");
  const list = await screen.findByRole("list", { name: "Historial" });
  expect(within(list).getByText("Dune")).toBeInTheDocument();
  expect(within(list).getByText("1x03 · Ep 3")).toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Viendo ahora" })).toHaveTextContent("Shōgun");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Usuario" }), "u1");
  await userEvent.click(screen.getByRole("tab", { name: "Películas" }));
  await userEvent.click(screen.getByRole("switch", { name: "Solo vistas completas" }));
  const last = requests.filter((r) => r.path === "/api/v2/public/history").at(-1);
  expect(Object.fromEntries(last.query)).toMatchObject({ user_id: "u1", media_type: "movie", watched: "true" });
});

test("con Plex y Tracearr, «Viendo ahora» sale una sola vez y con los datos de Plex", async () => {
  const tracearrPaths: string[] = [];
  mockBackend({
    api: {
      tracearr: (req) => {
        tracearrPaths.push(req.path);
        if (req.path === "/api/v2/public/streams") return { data: [{ id: "x", media_title: "De Tracearr" }] };
        return { data: [], meta: { nextCursor: null } };
      },
      plex: (req) =>
        req.path === "/status/sessions"
          ? { MediaContainer: { Metadata: [{ ratingKey: "1", type: "movie", title: "De Plex", thumb: "/t", User: { title: "Ana" }, Session: { id: "s" } }] } }
          : null,
    },
  });
  renderApp("/historial");
  expect(await screen.findByText("De Plex")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "Viendo ahora" })).toHaveLength(1);
  expect(screen.queryByText("De Tracearr")).not.toBeInTheDocument();
  expect(tracearrPaths).not.toContain("/api/v2/public/streams");
});

test("los avatares salen de Plex si el usuario lo tiene allí; si no, de Tracearr", async () => {
  mockBackend({
    commands: { plex_users: () => [{ username: "ana", title: "Ana", thumb: "https://plex.tv/users/ana/avatar" }] },
    api: {
      radarr: (req) =>
        req.path === "/api/v3/movie"
          ? [{ id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [] }]
          : {},
      tracearr: () => ({
        data: [play({ user: { ...ana, avatar_url: "/api/v1/images/proxy?a" } }), play({ user: { ...luis, avatar_url: "/api/v1/images/proxy?l" } })],
        meta: { nextCursor: null, pageSize: 100 },
      }),
    },
  });
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const seen = await within(await screen.findByRole("dialog")).findByRole("region", { name: "Visto por" });
  await waitFor(() => expect(seen.querySelector('img[src="https://plex.tv/users/ana/avatar"]')).toBeInTheDocument());
  const imgs = [...seen.querySelectorAll("img")].map((i) => i.getAttribute("src"));
  expect(imgs.some((src) => src?.includes("tracearr") && src.includes("proxy"))).toBe(true);
  expect(imgs.filter((src) => src === "https://plex.tv/users/ana/avatar")).toHaveLength(1);
});
