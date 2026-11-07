import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const collections = [
  {
    id: 1,
    title: "Dune - Colección",
    sortTitle: "dune coleccion",
    tmdbId: 726871,
    overview: "La saga de Arrakis.",
    images: [{ coverType: "poster", remoteUrl: "https://img/dune-col.jpg" }],
    monitored: false,
    rootFolderPath: "/movies/",
    qualityProfileId: 4,
    searchOnAdd: true,
    minimumAvailability: "released",
    missingMovies: 1,
    movies: [
      { tmdbId: 10, title: "Dune", year: 2021, isExisting: true, isExcluded: false, images: [] },
      { tmdbId: 20, title: "Dune: Parte dos", year: 2024, isExisting: false, isExcluded: false, images: [] },
      { tmdbId: 30, title: "Dune Mesías", year: 2026, isExisting: false, isExcluded: true, images: [] },
    ],
  },
  {
    id: 2,
    title: "Blade Runner - Colección",
    tmdbId: 422837,
    images: [],
    monitored: true,
    rootFolderPath: "/movies",
    qualityProfileId: 4,
    searchOnAdd: false,
    minimumAvailability: "released",
    missingMovies: 0,
    movies: [{ tmdbId: 12, title: "Blade Runner", year: 1982, isExisting: true, isExcluded: false }],
  },
];

const movies = [
  { id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [], collection: { tmdbId: 726871, title: "Dune - Colección" } },
  { id: 3, title: "Blade Runner", year: 1982, tmdbId: 12, hasFile: false, monitored: true, images: [] },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/collection" && req.method === "GET") return collections;
        if (req.path === "/api/v3/movie" && req.method === "GET") return movies;
        if (req.path === "/api/v3/qualityprofile") return [{ id: 4, name: "HD-1080p" }, { id: 5, name: "4K" }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "/movies" }];
        if (req.path === "/api/v3/movie" && req.method === "POST") return { id: 99 };
        return {};
      },
    },
  });
  return calls;
}

test("lista las colecciones y filtra las incompletas", async () => {
  backend();
  renderApp("/colecciones");
  expect(await screen.findByRole("button", { name: "Dune - Colección" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Dune - Colección" })).toHaveAttribute("src", "https://img/dune-col.jpg");
  expect(screen.getByText("Falta 1")).toBeInTheDocument();
  // La excluida no cuenta: 1 de 2.
  expect(screen.getByText("1/2")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Incompletas" }));
  expect(screen.queryByRole("button", { name: "Blade Runner - Colección" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Monitorizadas" }));
  expect(screen.getByRole("button", { name: "Blade Runner - Colección" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Dune - Colección" })).not.toBeInTheDocument();
});

test("añade la que falta con los ajustes de la colección", async () => {
  const calls = backend();
  renderApp("/colecciones");
  await userEvent.click(await screen.findByRole("button", { name: "Dune - Colección" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Dune (2021)" })).toBeInTheDocument();
  expect(within(dialog).getByText("Excluida")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir las que faltan (1)" }));
  const posts = calls.filter((c) => c.method === "POST" && c.path === "/api/v3/movie");
  expect(posts).toHaveLength(1);
  expect(posts[0].body.value).toMatchObject({
    tmdbId: 20,
    title: "Dune: Parte dos",
    qualityProfileId: 4,
    rootFolderPath: "/movies",
    minimumAvailability: "released",
    monitored: true,
    addOptions: { searchForMovie: true },
  });
});

test("monitorizar guarda los ajustes y pide a Radarr que añada las que faltan", async () => {
  const calls = backend();
  renderApp("/colecciones");
  await userEvent.click(await screen.findByRole("button", { name: "Dune - Colección" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Perfil de calidad" }), "5");
  await userEvent.click(within(dialog).getByRole("switch", { name: "Monitorizar la colección" }));
  const put = calls.find((c) => c.method === "PUT" && c.path === "/api/v3/collection/1");
  expect(put.body.value).toMatchObject({ id: 1, monitored: true, qualityProfileId: 5, rootFolderPath: "/movies", searchOnAdd: true });
  expect(calls.find((c) => c.path === "/api/v3/command")?.body?.value).toEqual({ name: "RefreshCollections", collectionIds: [1] });
});

test("la ficha de una película enlaza con su colección", async () => {
  backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  await userEvent.click(await screen.findByRole("link", { name: /Dune - Colección/ }));
  const dialog = await screen.findByRole("dialog", { name: "Dune - Colección" });
  expect(within(dialog).getByText("1 de 2 en la biblioteca")).toBeInTheDocument();
});
