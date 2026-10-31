import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { setPrefs } from "@/hooks/usePrefs";

const movies = [
  {
    id: 1,
    title: "Dune",
    year: 2021,
    tmdbId: 10,
    hasFile: true,
    monitored: true,
    added: "2024-01-01",
    images: [{ coverType: "poster", remoteUrl: "https://img/dune.jpg" }],
    movieFile: { quality: { quality: { name: "Bluray-2160p" } } },
    sizeOnDisk: 50 * 1024 ** 3,
  },
  { id: 2, title: "Arrival", year: 2016, tmdbId: 11, hasFile: false, monitored: true, added: "2025-01-01", images: [] },
  {
    id: 3,
    title: "Blade Runner",
    year: 1982,
    tmdbId: 12,
    hasFile: false,
    monitored: false,
    added: "2023-01-01",
    images: [{ coverType: "poster", url: "/MediaCover/3/poster.jpg" }],
  },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return movies;
        if (req.path === "/api/v3/qualityprofile") return [{ id: 4, name: "HD-1080p" }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "/movies", freeSpace: 1024 ** 4 }];
        if (req.path === "/api/v3/movie/lookup")
          return [
            { title: "Interstellar", year: 2014, tmdbId: 157336, images: [] },
            { title: "Dune", year: 2021, tmdbId: 10 },
          ];
        if (req.path === "/api/v3/movie" && req.method === "POST") return { id: 99, title: "Interstellar", year: 2014 };
        if (req.path === "/api/v3/release") return [];
        return {};
      },
    },
  });
  return calls;
}

test("muestra la biblioteca y filtra por faltan", async () => {
  backend();
  renderApp("/peliculas");
  expect(await screen.findByRole("button", { name: "Dune" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Dune" })).toHaveAttribute("src", "https://img/dune.jpg");
  expect(screen.getByRole("img", { name: "Blade Runner" })).toHaveAttribute(
    "src",
    "http://dasharr-img.localhost/radarr/api/v3/mediacover/3/poster-500.jpg",
  );
  await userEvent.click(screen.getByRole("tab", { name: "Faltan" }));
  expect(screen.queryByRole("button", { name: "Dune" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Arrival" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Blade Runner" })).not.toBeInTheDocument();
});

test("añadir película envía el perfil, la carpeta y buscar al añadir", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Añadir película" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByRole("textbox"), "inter");
  await userEvent.click(within(dialog).getByRole("button", { name: "Buscar" }));
  expect(await within(dialog).findByText("Ya en la biblioteca")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: /Interstellar/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir" }));
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v3/movie");
  expect(post.body.value).toMatchObject({
    tmdbId: 157336,
    qualityProfileId: 4,
    rootFolderPath: "/movies",
    monitored: true,
    addOptions: { searchForMovie: true },
  });
});

test("añadir película con búsqueda manual abre las releases para elegir", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Añadir película" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByRole("textbox"), "inter");
  await userEvent.click(within(dialog).getByRole("button", { name: "Buscar" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: /Interstellar/ }));
  await userEvent.click(within(dialog).getByRole("tab", { name: "Búsqueda manual" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir" }));
  expect(await screen.findByRole("dialog", { name: "Releases · Interstellar" })).toBeInTheDocument();
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v3/movie");
  expect(post.body.value.addOptions).toEqual({ searchForMovie: false });
  await vi.waitFor(() =>
    expect(calls.find((c) => c.path === "/api/v3/release" && c.method === "GET")?.query).toEqual([["movieId", "99"]]),
  );
});

test("ficha: búsqueda automática y borrar con confirmación", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune (2021)" });
  expect(within(dialog).getByText("Bluray-2160p")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Búsqueda automática" }));
  expect(calls.find((c) => c.path === "/api/v3/command")?.body.value).toEqual({ name: "MoviesSearch", movieIds: [1] });
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar película" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  const del = calls.find((c) => c.method === "DELETE");
  expect(del.path).toBe("/api/v3/movie/1");
  expect(del.query).toContainEqual(["deleteFiles", "false"]);
});

test("búsqueda manual: lista releases y descarga la elegida", async () => {
  const calls = backend();
  const releases = [
    {
      guid: "a",
      title: "Dune.2021.1080p.WEB",
      indexer: "IdxA",
      indexerId: 7,
      size: 4 * 1024 ** 3,
      seeders: 50,
      leechers: 2,
      protocol: "torrent",
      quality: { quality: { name: "WEBDL-1080p" } },
      customFormatScore: 10,
      rejected: false,
    },
    {
      guid: "b",
      title: "Dune.2021.CAM",
      indexer: "IdxB",
      indexerId: 8,
      size: 1024 ** 3,
      seeders: 500,
      protocol: "torrent",
      rejected: true,
      rejections: ["Calidad no deseada"],
    },
  ];
  const { invoke } = await import("@tauri-apps/api/core");
  const base = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "api_request" && args.service === "radarr" && args.request.path === "/api/v3/release") {
      calls.push(args.request);
      return args.request.method === "GET" ? releases : {};
    }
    return base(cmd, args);
  });
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  await userEvent.click(await screen.findByRole("button", { name: "Búsqueda manual" }));
  expect(await screen.findByText("Dune.2021.1080p.WEB")).toBeInTheDocument();
  expect(screen.getByText("2 releases · 1 aceptadas")).toBeInTheDocument();
  const get = calls.find((c) => c.path === "/api/v3/release" && c.method === "GET");
  expect(get.query).toEqual([["movieId", "1"]]);
  // Ordenar por columna (semillas, de más a menos) y filtrar por palabras.
  await userEvent.click(screen.getByRole("button", { name: "Semillas" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Dune.2021.CAM");
  await userEvent.click(screen.getByRole("button", { name: "Semillas" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Dune.2021.1080p.WEB");
  await userEvent.type(screen.getByRole("textbox", { name: /Filtrar por palabras/ }), "-web");
  expect(screen.queryByText("Dune.2021.1080p.WEB")).not.toBeInTheDocument();
  await userEvent.clear(screen.getByRole("textbox", { name: /Filtrar por palabras/ }));
  await userEvent.click(screen.getByRole("button", { name: "Descargar: Dune.2021.1080p.WEB" }));
  await vi.waitFor(() =>
    expect(calls.find((c) => c.path === "/api/v3/release" && c.method === "POST")?.body).toEqual({
      type: "json",
      value: { guid: "a", indexerId: 7 },
    }),
  );
  // Las rechazadas piden confirmación antes de descargarse.
  await userEvent.click(screen.getByRole("button", { name: "Descargar: Dune.2021.CAM" }));
  expect(await screen.findByText(/Calidad no deseada/)).toBeInTheDocument();
});

test("muestra la nota de FilmAffinity en la lista y en la ficha", async () => {
  const asked: any[] = [];
  mockBackend({
    api: { radarr: (req) => (req.path === "/api/v3/movie" && req.method === "GET" ? movies : []) },
    commands: {
      filmaffinity_ratings: ({ items }) => {
        asked.push(...items);
        return { "movie:10": { id: 1, url: "https://www.filmaffinity.com/es/film1.html", title: "Dune", rating: 7.3 } };
      },
      filmaffinity_rating: ({ item }) =>
        item.id === 10 ? { id: 1, url: "https://www.filmaffinity.com/es/film1.html", title: "Dune", rating: 7.3, votes: 52310 } : null,
    },
  });
  renderApp("/peliculas");
  expect(await screen.findByTitle("Nota de FilmAffinity: 7,3")).toBeInTheDocument();
  expect(asked.map((i) => i.id).sort()).toEqual([10, 11, 12]);
  expect(asked.find((i) => i.id === 10)).toMatchObject({ kind: "movie", title: "Dune", year: 2021 });

  await userEvent.click(screen.getByRole("button", { name: "Dune" }));
  const link = await screen.findByRole("link", { name: /7,3/ });
  expect(link).toHaveAttribute("href", "https://www.filmaffinity.com/es/film1.html");
  expect(link).toHaveTextContent("52.310 votos");
});

test("la ficha muestra también las notas que trae Radarr", async () => {
  const rated = [
    {
      ...movies[0],
      ratings: {
        imdb: { value: 8.1, votes: 920000 },
        tmdb: { value: 7.8, votes: 0 },
        rottenTomatoes: { value: 92 },
        metacritic: { value: 0 },
      },
    },
  ];
  mockBackend({ api: { radarr: (req) => (req.path === "/api/v3/movie" && req.method === "GET" ? rated : []) } });
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const d = within(await screen.findByRole("dialog", { name: "Dune (2021)" }));
  expect(await d.findByText("IMDb")).toBeInTheDocument();
  expect(d.getByText("8,1")).toBeInTheDocument();
  expect(d.getByText("920.000 votos")).toBeInTheDocument();
  expect(d.getByText("7,8")).toBeInTheDocument();
  expect(d.getByText("92 %")).toBeInTheDocument();
  expect(d.queryByText("Metacritic")).not.toBeInTheDocument();
});

test("las notas ocultas en Ajustes no se muestran ni se consultan", async () => {
  setPrefs({ hiddenRatings: ["imdb", "filmaffinity"] });
  const asked: string[] = [];
  const rated = [{ ...movies[0], ratings: { imdb: { value: 8.1 }, tmdb: { value: 7.8 } } }];
  mockBackend({
    api: { radarr: (req) => (req.path === "/api/v3/movie" && req.method === "GET" ? rated : []) },
    commands: {
      filmaffinity_ratings: () => (asked.push("lista"), {}),
      filmaffinity_rating: () => (asked.push("ficha"), null),
    },
  });
  renderApp("/peliculas");
  expect(await screen.findByTitle("Nota de TMDb: 7,8")).toBeInTheDocument();
  expect(screen.queryByTitle("Nota de IMDb: 8,1")).not.toBeInTheDocument();
  const sort = screen.getByRole("combobox", { name: "Ordenar por" });
  expect(within(sort).queryByRole("option", { name: "Nota IMDb" })).not.toBeInTheDocument();
  expect(within(sort).queryByRole("option", { name: "Nota FilmAffinity" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Dune" }));
  const d = within(await screen.findByRole("dialog", { name: "Dune (2021)" }));
  expect(await d.findByText("TMDb")).toBeInTheDocument();
  expect(d.queryByText("IMDb")).not.toBeInTheDocument();
  expect(d.queryByText("FilmAffinity")).not.toBeInTheDocument();
  expect(asked).toEqual([]);
  setPrefs({ hiddenRatings: [] });
});

test("las portadas muestran las notas y se puede ordenar por ellas", async () => {
  const rated = [
    { ...movies[0], ratings: { imdb: { value: 8.1 }, rottenTomatoes: { value: 83 } } },
    { ...movies[1], ratings: { imdb: { value: 7.9 } } },
    { ...movies[2], ratings: { imdb: { value: 8.2 } } },
  ];
  mockBackend({
    api: { radarr: (req) => (req.path === "/api/v3/movie" && req.method === "GET" ? rated : []) },
    commands: {
      filmaffinity_ratings: () => ({
        "movie:10": { id: 1, url: "", title: "Dune", rating: 7.3 },
        "movie:11": { id: 2, url: "", title: "Arrival", rating: 7.6 },
      }),
    },
  });
  renderApp("/peliculas");
  expect(await screen.findByTitle("Nota de FilmAffinity: 7,3")).toBeInTheDocument();
  expect(screen.getByTitle("Nota de IMDb: 8,1")).toBeInTheDocument();
  expect(screen.getByTitle("Nota de Rotten Tomatoes: 83 %")).toBeInTheDocument();

  const order = () => screen.getAllByRole("button", { name: /^(Dune|Arrival|Blade Runner)$/ }).map((b) => b.getAttribute("aria-label"));
  const sort = screen.getByRole("combobox", { name: "Ordenar por" });
  await userEvent.selectOptions(sort, "Nota IMDb");
  expect(order()).toEqual(["Blade Runner", "Dune", "Arrival"]);
  await userEvent.selectOptions(sort, "Nota FilmAffinity");
  expect(order()).toEqual(["Arrival", "Dune", "Blade Runner"]);
});
