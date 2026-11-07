import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { setPrefs } from "@/hooks/usePrefs";
import { indexWatched, indexWatchedEpisodes, type WatchedMedia } from "@/api/tracearr";

const ME = "11111111-1111-4111-8111-111111111111";

const row = (r: Partial<WatchedMedia>): WatchedMedia => ({
  media_type: "movie",
  title: "",
  imdb_id: null,
  tmdb_id: null,
  tvdb_id: null,
  show_title: null,
  show_imdb_id: null,
  show_tmdb_id: null,
  show_tvdb_id: null,
  season_number: null,
  episode_number: null,
  watched_state: "watched",
  plays: 1,
  last_watched_day: "2026-11-01",
  episodes_watched: null,
  episode_count: null,
  ...r,
});

const movies = [
  { id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [] },
  { id: 2, title: "Arrival", year: 2016, tmdbId: 11, imdbId: "tt2543164", hasFile: true, monitored: true, images: [] },
  { id: 3, title: "Blade Runner", year: 1982, tmdbId: 12, hasFile: true, monitored: true, images: [] },
];

function backend() {
  const watchedQueries: [string, string][][] = [];
  mockBackend({
    api: {
      radarr: (req) => (req.path === "/api/v3/movie" ? movies : []),
      tracearr: (req) => {
        if (req.path === "/api/v2/public/users")
          return { data: [{ id: ME, username: "vitor", identity_name: "Vitor" }, { id: "2", username: "ana", identity_name: null }], meta: { nextCursor: null } };
        if (req.path === "/api/v2/public/watched-media") {
          watchedQueries.push(req.query);
          return {
            data: [
              row({ title: "Dune", tmdb_id: 10, plays: 2 }),
              row({ title: "Arrival", imdb_id: "tt2543164", watched_state: "partial" }),
            ],
            meta: { nextCursor: null },
          };
        }
        return { data: [] };
      },
    },
    commands: { plex_users: () => [] },
  });
  return watchedQueries;
}

afterEach(() => setPrefs({ watchUserId: null }));

test("sin elegir usuario no se pide nada ni se marca nada", async () => {
  const queries = backend();
  renderApp("/peliculas");
  expect(await screen.findByRole("button", { name: "Dune" })).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Lo has visto" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Visto por mí" })).not.toBeInTheDocument();
  expect(queries).toHaveLength(0);
});

test("marca lo visto y lo empezado, y filtra por ello", async () => {
  setPrefs({ watchUserId: ME });
  const queries = backend();
  renderApp("/peliculas");
  const dune = await screen.findByRole("button", { name: "Dune" });
  expect(await within(dune).findByRole("img", { name: "Lo has visto" })).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Arrival" })).getByRole("img", { name: "Lo has empezado" })).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Blade Runner" })).queryByRole("img", { name: /Lo has/ })).not.toBeInTheDocument();
  expect(queries[0]).toEqual(expect.arrayContaining([["media_type", "movie"], ["user_id", ME], ["min_state", "partial"]]));

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Visto por mí" }), "unseen");
  expect(screen.queryByRole("button", { name: "Dune" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Blade Runner" })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Visto por mí" }), "seen");
  expect(screen.getByRole("button", { name: "Dune" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Arrival" })).not.toBeInTheDocument();
});

test("en Ajustes se elige qué usuario de Plex eres", async () => {
  backend();
  renderApp("/ajustes/contenido");
  const vitor = await screen.findByRole("radio", { name: /Vitor/ });
  expect(screen.getByRole("radio", { name: "No marcar nada" })).toHaveAttribute("aria-checked", "true");
  await userEvent.click(vitor);
  expect(vitor).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: /ana/ })).toHaveAttribute("aria-checked", "false");
});

test("índices: por cualquier ID y episodios por serie", () => {
  const idx = indexWatched([row({ tmdb_id: 5, imdb_id: "tt1" })]);
  expect(idx.get({ imdbId: "tt1" })?.state).toBe("watched");
  expect(idx.get({ tmdbId: 6 })).toBeUndefined();
  const eps = indexWatchedEpisodes([
    row({ media_type: "episode", show_tvdb_id: 81189, season_number: 1, episode_number: 3, watched_state: "partial" }),
    row({ media_type: "episode", show_tvdb_id: 81189, show_tmdb_id: 1396, season_number: 1, episode_number: 3 }),
    row({ media_type: "episode", show_tmdb_id: 1396, season_number: 2, episode_number: 1 }),
  ]);
  const show = eps.forShow({ tvdbId: 81189 });
  expect(show?.get("1x3")?.state).toBe("watched");
  expect(eps.forShow({ tmdbId: 1396 })?.get("2x1")?.state).toBe("watched");
});
