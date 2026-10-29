import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const dune = {
  id: 1,
  title: "Dune",
  year: 2021,
  tmdbId: 10,
  hasFile: true,
  monitored: true,
  qualityProfileId: 4,
  minimumAvailability: "released",
  path: "/movies/Dune (2021)",
  rootFolderPath: "/movies",
  images: [],
  movieFile: { quality: { quality: { name: "WEBDL-720p" } } },
};
const arrival = { id: 2, title: "Arrival", year: 2016, tmdbId: 11, hasFile: false, monitored: true, images: [], inCinemas: "2016-11-10" };

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return [dune, arrival];
        if (req.path === "/api/v3/qualityprofile")
          return [
            { id: 4, name: "HD-1080p" },
            { id: 5, name: "Ultra-HD" },
          ];
        if (req.path === "/api/v3/rootfolder")
          return [
            { id: 1, path: "/movies" },
            { id: 2, path: "/movies4k/" },
          ];
        if (req.path === "/api/v3/wanted/missing") return { page: 1, pageSize: 2000, totalRecords: 1, records: [arrival] };
        if (req.path === "/api/v3/wanted/cutoff") return { page: 1, pageSize: 2000, totalRecords: 1, records: [dune] };
        if (req.path === "/api/v3/history/movie")
          return [
            { id: 1, eventType: "grabbed", date: "2024-01-01T10:00:00Z", sourceTitle: "Dune.2021.720p", data: { indexer: "IdxA" } },
            {
              id: 2,
              eventType: "downloadFailed",
              date: "2024-01-02T10:00:00Z",
              sourceTitle: "Dune.2021.1080p",
              data: { message: "Torrent roto" },
            },
          ];
        return {};
      },
    },
  });
  return calls;
}

test("buscadas: lista lo que falta y lo que puede mejorar, y busca todo", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("tab", { name: "Buscadas" }));
  expect(await screen.findByRole("button", { name: /^Arrival \(2016\)/ })).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/api/v3/wanted/missing")?.query).toContainEqual(["monitored", "true"]);
  await userEvent.click(screen.getByRole("tab", { name: "Mejorar calidad" }));
  expect(await screen.findByText("Ahora: WEBDL-720p")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Buscar todas" }));
  const confirm = await screen.findByRole("dialog", { name: "Buscar todas" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Buscar todas" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/command")?.body.value).toEqual({ name: "CutoffUnmetMoviesSearch" }));
});

test("ficha: historial y editar perfil y carpeta moviendo los archivos", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune (2021)" });
  await userEvent.click(within(dialog).getByRole("button", { name: /Historial de descargas/ }));
  expect(await within(dialog).findByText("Descarga fallida")).toBeInTheDocument();
  expect(within(dialog).getByText("Torrent roto")).toBeInTheDocument();
  // Lo más reciente primero.
  expect(within(dialog).getAllByRole("listitem")[0]).toHaveTextContent("Dune.2021.1080p");

  await userEvent.click(within(dialog).getByRole("button", { name: "Editar" }));
  const edit = await screen.findByRole("dialog", { name: "Editar · Dune" });
  await userEvent.selectOptions(within(edit).getByLabelText("Perfil de calidad"), "5");
  await userEvent.selectOptions(within(edit).getByLabelText("Carpeta raíz"), "/movies4k");
  expect(within(edit).getByText("/movies4k/Dune (2021)")).toBeInTheDocument();
  await userEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  const put = calls.find((c) => c.method === "PUT");
  expect(put.path).toBe("/api/v3/movie/1");
  expect(put.query).toContainEqual(["moveFiles", "true"]);
  expect(put.body.value).toMatchObject({ qualityProfileId: 5, path: "/movies4k/Dune (2021)", minimumAvailability: "released" });
});
