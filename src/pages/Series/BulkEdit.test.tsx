import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

test("series: edición masiva con seriesIds y solo las de la sección", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      sonarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/series" && req.method === "GET")
          return [
            { id: 1, title: "Severance", year: 2022, tvdbId: 1, monitored: true, seriesType: "standard" },
            { id: 2, title: "Frieren", year: 2023, tvdbId: 2, monitored: true, seriesType: "anime" },
          ];
        if (req.path === "/api/v3/qualityprofile") return [{ id: 4, name: "HD" }];
        return [];
      },
    },
  });
  renderApp("/series");
  await screen.findByRole("button", { name: "Severance" });
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
  const bar = screen.getByRole("toolbar", { name: "Acciones con la selección" });
  await userEvent.click(within(bar).getByRole("button", { name: "Seleccionar las 1 visibles" }));
  await userEvent.click(within(bar).getByRole("button", { name: "Monitorizar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/series/editor")).toBeTruthy());
  expect(calls.find((c) => c.path === "/api/v3/series/editor")).toMatchObject({ method: "PUT", body: { value: { seriesIds: [1], monitored: true } } });

  await userEvent.click(within(bar).getByRole("button", { name: "Borrar" }));
  const del = await screen.findByRole("dialog", { name: "Borrar 1 elemento" });
  await userEvent.click(within(del).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")).toBeTruthy());
  expect(calls.find((c) => c.method === "DELETE").body.value).toEqual({ seriesIds: [1], deleteFiles: false, addImportListExclusion: false });
});
