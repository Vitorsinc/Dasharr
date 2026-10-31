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
  images: [],
  movieFile: { id: 55, relativePath: "dune.mkv", quality: { quality: { name: "Bluray-1080p" } } },
};

function backend(rename: unknown[] = []) {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return [dune];
        if (req.path === "/api/v3/rename") return rename;
        return [];
      },
    },
  });
  return calls;
}

async function openDune() {
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  return screen.findByRole("dialog", { name: "Dune (2021)" });
}

const commands = (calls: any[]) => calls.filter((c) => c.path === "/api/v3/command").map((c) => c.body.value);

test("ficha de película: actualizar, reescanear y borrar el archivo con confirmación", async () => {
  const calls = backend();
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Actualizar" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Reescanear" }));
  await vi.waitFor(() =>
    expect(commands(calls)).toEqual([
      { name: "RefreshMovie", movieIds: [1] },
      { name: "RescanMovie", movieId: 1 },
    ]),
  );

  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar archivo" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar archivo de la película" });
  expect(calls.find((c) => c.path.startsWith("/api/v3/moviefile"))).toBeUndefined();
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/moviefile/55"));
});

test("ficha de película: renombrar con vista previa", async () => {
  const calls = backend([{ movieId: 1, movieFileId: 55, existingPath: "Dune/dune.mkv", newPath: "Dune (2021)/Dune (2021) Bluray-1080p.mkv" }]);
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Renombrar" }));
  const preview = await screen.findByRole("dialog", { name: "Renombrar · Dune" });
  expect(await within(preview).findByText("Dune (2021)/Dune (2021) Bluray-1080p.mkv")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/api/v3/rename").query).toEqual([["movieId", "1"]]);
  await userEvent.click(within(preview).getByRole("button", { name: "Renombrar 1" }));
  await vi.waitFor(() => expect(commands(calls)).toEqual([{ name: "RenameMovie", movieIds: [1] }]));
});

test("ficha de película: sin nada que renombrar lo dice", async () => {
  backend([]);
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Renombrar" }));
  const preview = await screen.findByRole("dialog", { name: "Renombrar · Dune" });
  expect(await within(preview).findByText("Todos los archivos ya tienen el nombre correcto.")).toBeInTheDocument();
});
