import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { historyItemTitle } from "@/api/arrActivity";

const q = (c: any, key: string) => c.query.filter(([k]: string[]) => k === key).map(([, v]: string[]) => v);

test("historyItemTitle: película con año, serie con episodio o la biblioteca", () => {
  const titles = new Map([[9, "Heat"]]);
  expect(historyItemTitle({ id: 1, eventType: "grabbed", date: "", sourceTitle: "x", movie: { id: 1, title: "Dune", year: 2021 } }, titles)).toBe(
    "Dune (2021)",
  );
  expect(
    historyItemTitle(
      { id: 1, eventType: "grabbed", date: "", sourceTitle: "x", series: { id: 2, title: "Severance" }, episode: { seasonNumber: 1, episodeNumber: 3, title: "t" } },
      titles,
    ),
  ).toBe("Severance · 1x03");
  expect(historyItemTitle({ id: 1, eventType: "grabbed", date: "", sourceTitle: "x", movieId: 9 }, titles)).toBe("Heat");
  expect(historyItemTitle({ id: 1, eventType: "grabbed", date: "", sourceTitle: "Suelta" }, titles)).toBe("Suelta");
});

test("historial global de Radarr: lista, filtra por tipo, pagina y marca como fallida", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/history")
          return {
            page: 1,
            pageSize: 50,
            totalRecords: 75,
            records: [
              {
                id: 10,
                eventType: "grabbed",
                date: "2024-01-02T10:00:00Z",
                sourceTitle: "Dune.2021.1080p",
                movie: { id: 1, title: "Dune", year: 2021 },
                data: { indexer: "IdxA" },
              },
              {
                id: 11,
                eventType: "downloadFailed",
                date: "2024-01-01T10:00:00Z",
                sourceTitle: "Heat.1995.720p",
                movieId: 2,
                data: { message: "Torrent roto" },
              },
            ],
          };
        if (req.path === "/api/v3/movie") return [{ id: 2, title: "Heat", year: 1995, tmdbId: 1, hasFile: false, monitored: true }];
        return {};
      },
    },
  });
  renderApp("/actividad/radarr");
  const tabs = await screen.findByRole("navigation", { name: "Secciones de actividad" });
  expect(within(tabs).getByRole("link", { name: "Historial" })).toHaveAttribute("aria-current", "page");
  const list = await screen.findByRole("list", { name: "Historial" });
  expect(within(list).getByText("Dune (2021)")).toBeInTheDocument();
  expect(within(list).getByText("Descarga fallida")).toBeInTheDocument();
  expect(within(list).getByText("Torrent roto")).toBeInTheDocument();
  expect(await within(list).findByText("Heat")).toBeInTheDocument();
  const first = calls.find((c) => c.path === "/api/v3/history");
  expect(q(first, "includeMovie")).toEqual(["true"]);
  expect(q(first, "eventType")).toEqual([]);
  expect(q(first, "sortDirection")).toEqual(["descending"]);

  await userEvent.click(screen.getByRole("tab", { name: "Importadas" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v3/history" && q(c, "eventType").join() === "3,7")).toBe(true));
  await userEvent.click(screen.getByRole("tab", { name: "Fallidas" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v3/history" && q(c, "eventType").join() === "4")).toBe(true));

  await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
  await vi.waitFor(() =>
    expect(calls.some((c) => c.path === "/api/v3/history" && q(c, "page").join() === "2" && q(c, "eventType").join() === "4")).toBe(true),
  );
  expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();

  // Solo la enviada se puede marcar como fallida.
  const mark = screen.getAllByRole("button", { name: /^Marcar como fallida/ });
  expect(mark).toHaveLength(1);
  await userEvent.click(mark[0]);
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Marcar la descarga como fallida" })).getByRole("button", { name: "Marcar como fallida" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe("/api/v3/history/failed/10"));
});

test("historial global de Sonarr: pide serie y episodio y usa sus números de evento", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      sonarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/history") return { page: 1, pageSize: 50, totalRecords: 0, records: [] };
        return [];
      },
    },
  });
  renderApp("/actividad/sonarr");
  expect(await screen.findByText("No hay nada en el historial con este filtro.")).toBeInTheDocument();
  const first = calls.find((c) => c.path === "/api/v3/history");
  expect(q(first, "includeSeries")).toEqual(["true"]);
  expect(q(first, "includeEpisode")).toEqual(["true"]);
  await userEvent.click(screen.getByRole("tab", { name: "Borradas" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v3/history" && q(c, "eventType").join() === "5")).toBe(true));
  await userEvent.click(screen.getByRole("tab", { name: "Renombradas" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v3/history" && q(c, "eventType").join() === "6")).toBe(true));
});
