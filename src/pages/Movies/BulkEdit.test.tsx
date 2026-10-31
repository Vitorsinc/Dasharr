import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const movies = [
  { id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [] },
  { id: 2, title: "Arrival", year: 2016, tmdbId: 11, hasFile: false, monitored: true, images: [] },
  { id: 3, title: "Heat", year: 1995, tmdbId: 12, hasFile: false, monitored: false, images: [] },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return movies;
        if (req.path === "/api/v3/qualityprofile")
          return [
            { id: 4, name: "HD-1080p" },
            { id: 5, name: "Ultra-HD" },
          ];
        if (req.path === "/api/v3/rootfolder")
          return [
            { id: 1, path: "/movies" },
            { id: 2, path: "/movies4k" },
          ];
        if (req.path === "/api/v3/tag") return [{ id: 7, label: "4k" }];
        return [];
      },
    },
  });
  return calls;
}

const editorCalls = (calls: any[]) => calls.filter((c) => c.path === "/api/v3/movie/editor");

test("selección múltiple: monitorizar, perfil, etiquetas, carpeta moviendo archivos y borrar", async () => {
  const calls = backend();
  renderApp("/peliculas");
  await screen.findByRole("button", { name: "Dune" });
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
  const bar = screen.getByRole("toolbar", { name: "Acciones con la selección" });
  // Sin nada elegido, las acciones están desactivadas.
  expect(within(bar).getByRole("button", { name: "Monitorizar" })).toBeDisabled();

  // En modo selección, pulsar una portada la elige en vez de abrir la ficha.
  await userEvent.click(screen.getByRole("button", { name: "Dune" }));
  expect(screen.getByRole("button", { name: "Dune" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Heat" }));
  expect(within(bar).getByText("2 seleccionadas")).toBeInTheDocument();

  await userEvent.click(within(bar).getByRole("button", { name: "No monitorizar" }));
  await vi.waitFor(() => expect(editorCalls(calls)).toHaveLength(1));
  expect(editorCalls(calls)[0]).toMatchObject({ method: "PUT", body: { value: { movieIds: [1, 3], monitored: false } } });

  await userEvent.click(within(bar).getByRole("button", { name: "Perfil" }));
  const profile = await screen.findByRole("dialog", { name: "Perfil de calidad de 2" });
  await userEvent.selectOptions(within(profile).getByLabelText("Perfil de calidad"), "5");
  await userEvent.click(within(profile).getByRole("button", { name: "Aplicar" }));
  await vi.waitFor(() => expect(editorCalls(calls)).toHaveLength(2));
  expect(editorCalls(calls)[1].body.value).toEqual({ movieIds: [1, 3], qualityProfileId: 5 });

  await userEvent.click(within(bar).getByRole("button", { name: "Etiquetas" }));
  const tags = await screen.findByRole("dialog", { name: "Etiquetas de 2" });
  await userEvent.click(within(tags).getByRole("button", { name: "Etiqueta 4k" }));
  await userEvent.click(within(tags).getByRole("tab", { name: "Quitar" }));
  await userEvent.click(within(tags).getByRole("button", { name: "Aplicar" }));
  await vi.waitFor(() => expect(editorCalls(calls)).toHaveLength(3));
  expect(editorCalls(calls)[2].body.value).toEqual({ movieIds: [1, 3], tags: [7], applyTags: "remove" });

  await userEvent.click(within(bar).getByRole("button", { name: "Carpeta" }));
  const root = await screen.findByRole("dialog", { name: "Carpeta raíz de 2" });
  await userEvent.selectOptions(within(root).getByLabelText("Carpeta raíz"), "/movies4k");
  expect(within(root).getByRole("note")).toHaveTextContent("moverá en el disco los archivos de 2 elementos a /movies4k");
  await userEvent.click(within(root).getByRole("button", { name: "Mover 2" }));
  await vi.waitFor(() => expect(editorCalls(calls)).toHaveLength(4));
  expect(editorCalls(calls)[3].body.value).toEqual({ movieIds: [1, 3], rootFolderPath: "/movies4k", moveFiles: true });

  await userEvent.click(within(bar).getByRole("button", { name: "Borrar" }));
  const del = await screen.findByRole("dialog", { name: "Borrar 2 elementos" });
  await userEvent.click(within(del).getByRole("checkbox", { name: "Borrar también los archivos" }));
  await userEvent.click(within(del).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(editorCalls(calls)).toHaveLength(5));
  expect(editorCalls(calls)[4]).toMatchObject({
    method: "DELETE",
    body: { value: { movieIds: [1, 3], deleteFiles: true, addImportExclusion: false } },
  });
});

test("seleccionar todas las visibles respeta el filtro y salir limpia la selección", async () => {
  backend();
  renderApp("/peliculas");
  await screen.findByRole("button", { name: "Dune" });
  await userEvent.click(screen.getByRole("tab", { name: "Faltan" }));
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
  const bar = screen.getByRole("toolbar", { name: "Acciones con la selección" });
  await userEvent.click(within(bar).getByRole("button", { name: "Seleccionar las 1 visibles" }));
  expect(within(bar).getByText("1 seleccionada")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Arrival" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(within(bar).getByRole("button", { name: "Terminar" }));
  expect(screen.queryByRole("toolbar", { name: "Acciones con la selección" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Arrival" })).not.toHaveAttribute("aria-pressed");
});
