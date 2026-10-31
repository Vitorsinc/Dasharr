import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { exclusionLabel, exclusionsPath, isImportListEnabled } from "@/api/arrManage";

test("cada *arr usa su campo de activación y su ruta de exclusiones", () => {
  expect(isImportListEnabled("radarr", { id: 1, name: "a", enabled: true, enableAutomaticAdd: false })).toBe(true);
  expect(isImportListEnabled("sonarr", { id: 1, name: "a", enabled: true, enableAutomaticAdd: false })).toBe(false);
  expect(exclusionsPath("radarr")).toBe("/api/v3/exclusions");
  expect(exclusionsPath("sonarr")).toBe("/api/v3/importlistexclusion");
  expect(exclusionLabel({ id: 1, movieTitle: "Heat", movieYear: 1995 })).toBe("Heat (1995)");
  expect(exclusionLabel({ id: 1, title: "Lost", tvdbId: 3 })).toBe("Lost");
});

test("listas de Sonarr: desactivar mandando la lista completa, sincronizar y borrar", async () => {
  const calls: any[] = [];
  const list = { id: 3, name: "Trakt popular", implementationName: "Trakt List", enableAutomaticAdd: true, qualityProfileId: 4, fields: [{ name: "x" }] };
  mockBackend({
    api: {
      sonarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/importlist" && req.method === "GET") return [list];
        if (req.method === "PUT") return req.body.value;
        return {};
      },
    },
  });
  renderApp("/ajustes/servicios/sonarr/listas");
  expect(await screen.findByText("Trakt popular")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("switch", { name: "Desactivar Trakt popular" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT")).toMatchObject({
    path: "/api/v3/importlist/3",
    body: { value: { ...list, enableAutomaticAdd: false } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/command")?.body.value).toEqual({ name: "ImportListSync" }));

  await userEvent.click(screen.getByRole("button", { name: "Borrar: Trakt popular" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Borrar lista de importación" })).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/importlist/3"));
});

test("exclusiones de Radarr: filtrar y quitar con confirmación", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/exclusions" && req.method === "GET")
          return [
            { id: 1, tmdbId: 949, movieTitle: "Heat", movieYear: 1995 },
            { id: 2, tmdbId: 603, movieTitle: "Matrix", movieYear: 1999 },
          ];
        return {};
      },
    },
  });
  renderApp("/ajustes/servicios/radarr/exclusiones");
  expect(await screen.findByText("Heat (1995)")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: "Filtrar exclusiones…" }), "matr");
  expect(screen.queryByText("Heat (1995)")).not.toBeInTheDocument();
  expect(screen.getByText("1 exclusión")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Quitar exclusión: Matrix (1999)" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Quitar de las exclusiones" })).getByRole("button", { name: "Quitar exclusión" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/exclusions/2"));
});

test("borrar una película desde la ficha puede añadirla a las exclusiones", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET")
          return [{ id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [] }];
        return [];
      },
    },
  });
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune (2021)" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar película" });
  await userEvent.click(within(confirm).getByRole("checkbox", { name: /Añadir a las exclusiones/ }));
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")).toBeTruthy());
  const del = calls.find((c) => c.method === "DELETE");
  expect(del.path).toBe("/api/v3/movie/1");
  expect(del.query).toEqual([
    ["deleteFiles", "false"],
    ["addImportExclusion", "true"],
  ]);
});
