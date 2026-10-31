import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { blocklistTitle } from "@/api/arrActivity";

const blocked = [
  {
    id: 7,
    movieId: 1,
    movie: { id: 1, title: "Dune", year: 2021 },
    sourceTitle: "Dune.2021.1080p.CAM",
    date: "2024-02-01T10:00:00Z",
    protocol: "torrent",
    indexer: "IdxA",
    message: "Release rota",
    quality: { quality: { name: "CAM" } },
  },
  { id: 8, movieId: 2, sourceTitle: "Arrival.2016.720p", date: "2024-01-01T10:00:00Z", protocol: "torrent" },
];

function backend(records = blocked) {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/blocklist") return { page: 1, pageSize: 50, totalRecords: records.length, records };
        if (req.path === "/api/v3/movie") return [{ id: 2, title: "Arrival", year: 2016, tmdbId: 11, hasFile: false, monitored: true }];
        if (req.path === "/api/v3/command" && req.method === "POST") return { id: 33, status: "queued" };
        if (req.path === "/api/v3/command/33") return { id: 33, status: "completed", result: "successful" };
        return {};
      },
    },
  });
  return calls;
}

test("blocklistTitle usa la película, la serie, la biblioteca o la release", () => {
  const titles = new Map([[2, "Arrival"]]);
  expect(blocklistTitle(blocked[0] as any, titles)).toBe("Dune (2021)");
  expect(blocklistTitle(blocked[1] as any, titles)).toBe("Arrival");
  expect(blocklistTitle({ id: 1, sourceTitle: "X.S01", date: "", series: { id: 3, title: "Frieren" } }, titles)).toBe("Frieren");
  expect(blocklistTitle({ id: 1, sourceTitle: "Suelta", date: "" }, titles)).toBe("Suelta");
});

test("bloqueadas: lista, quita una y varias con confirmación, y vacía", async () => {
  const calls = backend();
  renderApp("/actividad/radarr/bloqueadas");
  expect(await screen.findByRole("heading", { name: "Actividad de Radarr" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Actividad · Radarr" })).toHaveAttribute("aria-current", "page");
  expect(await screen.findByText("Dune (2021)")).toBeInTheDocument();
  expect(screen.getByText("Release rota")).toBeInTheDocument();
  expect(await screen.findByText("Arrival")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/api/v3/blocklist").query).toEqual(
    expect.arrayContaining([
      ["page", "1"],
      ["sortKey", "date"],
    ]),
  );

  await userEvent.click(screen.getByRole("button", { name: "Quitar de la lista: Dune.2021.1080p.CAM" }));
  const one = await screen.findByRole("dialog", { name: "Quitar de la lista de bloqueadas" });
  await userEvent.click(within(one).getByRole("button", { name: "Quitar de la lista" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE" && c.path === "/api/v3/blocklist/7")).toBeTruthy());

  await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar toda la página" }));
  await userEvent.click(screen.getByRole("button", { name: "Quitar 2" }));
  const many = await screen.findByRole("dialog", { name: "Quitar 2 releases bloqueadas" });
  await userEvent.click(within(many).getByRole("button", { name: "Quitar 2" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/blocklist/bulk")).toBeTruthy());
  const bulk = calls.find((c) => c.path === "/api/v3/blocklist/bulk");
  expect(bulk.method).toBe("DELETE");
  expect(bulk.body.value).toEqual({ ids: [7, 8] });

  await userEvent.click(screen.getByRole("button", { name: "Vaciar lista" }));
  const clear = await screen.findByRole("dialog", { name: "Vaciar la lista de bloqueadas" });
  await userEvent.click(within(clear).getByRole("button", { name: "Vaciar lista" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/command/33")).toBeTruthy());
  expect(calls.find((c) => c.path === "/api/v3/command" && c.method === "POST").body.value).toEqual({ name: "ClearBlocklist" });
});

test("bloqueadas: estado vacío", async () => {
  backend([]);
  renderApp("/actividad/radarr/bloqueadas");
  expect(await screen.findByText("No hay ninguna release bloqueada.")).toBeInTheDocument();
});

test("historial de una ficha: marcar como fallida una descarga enviada", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      sonarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/series")
          return [{ id: 5, title: "Severance", year: 2022, tvdbId: 1, monitored: true, seriesType: "standard", seasons: [] }];
        if (req.path === "/api/v3/episode") return [];
        if (req.path === "/api/v3/history/series")
          return [
            { id: 70, eventType: "grabbed", date: "2024-01-02T10:00:00Z", sourceTitle: "Severance.S01E01.1080p" },
            { id: 71, eventType: "downloadFolderImported", date: "2024-01-03T10:00:00Z", sourceTitle: "Severance.S01E01.1080p" },
          ];
        return [];
      },
    },
  });
  renderApp("/series");
  await userEvent.click(await screen.findByRole("button", { name: "Severance" }));
  const dialog = await screen.findByRole("dialog", { name: "Severance" });
  await userEvent.click(within(dialog).getByRole("button", { name: /Historial de descargas/ }));
  // Solo la línea «enviada» tiene la acción.
  const buttons = await within(dialog).findAllByRole("button", { name: /^Marcar como fallida/ });
  expect(buttons).toHaveLength(1);
  await userEvent.click(buttons[0]);
  const confirm = await screen.findByRole("dialog", { name: "Marcar la descarga como fallida" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Marcar como fallida" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path === "/api/v3/history/failed/70")).toBeTruthy());
});
