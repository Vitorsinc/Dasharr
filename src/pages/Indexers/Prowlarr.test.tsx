import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { optionValue, parseTagList, setFieldValue, visibleFields } from "@/lib/providerFields";
import type { ProviderField } from "@/api/prowlarr";
import { prowlarrHistoryDetail } from "./History";

const fields: ProviderField[] = [
  { order: 2, name: "apiKey", label: "API Key", type: "password", value: "" },
  { order: 1, name: "baseUrl", label: "Base Url", type: "select", value: "https://a", selectOptions: [{ value: "https://a", name: "a" }] },
  { order: 3, name: "sort", label: "Sort", type: "select", value: 0, advanced: true, selectOptions: [{ value: 0, name: "created" }, { value: 1, name: "seeders" }] },
  { order: 4, name: "secret", type: "textbox", hidden: "hidden" },
  { order: 5, name: "maybe", type: "textbox", hidden: "hiddenIfNotSet", value: "" },
  { order: 6, name: "info", type: "info", helpText: "Necesita cuenta" },
];

test("campos dinámicos: orden, ocultos, avanzados y valores", () => {
  expect(visibleFields(fields, false).map((f) => f.name)).toEqual(["baseUrl", "apiKey", "info"]);
  expect(visibleFields(fields, true).map((f) => f.name)).toEqual(["baseUrl", "apiKey", "sort", "info"]);
  expect(setFieldValue(fields, "apiKey", "k").find((f) => f.name === "apiKey")?.value).toBe("k");
  expect(optionValue(fields[2], "1")).toBe(1);
  expect(optionValue(fields[1], "https://a")).toBe("https://a");
  expect(parseTagList(" a, b ,,c ")).toEqual(["a", "b", "c"]);
});

test("detalle del historial: consulta o título, aplicación y resultados", () => {
  expect(
    prowlarrHistoryDetail({
      id: 1,
      indexerId: 1,
      date: "",
      successful: true,
      eventType: "indexerQuery",
      data: { query: "dune", source: "Radarr", queryResults: "12", elapsedTime: "340" },
    }),
  ).toEqual({ what: "dune", extra: "desde Radarr · 12 resultados · 340 ms" });
  expect(
    prowlarrHistoryDetail({ id: 1, indexerId: 1, date: "", successful: true, eventType: "releaseGrabbed", data: { grabTitle: "Dune.2021", source: "Radarr" } }),
  ).toEqual({ what: "Dune.2021", extra: "desde Radarr" });
});

const schema = [
  {
    name: "Nyaa.si",
    implementation: "Cardigann",
    implementationName: "Cardigann",
    configContract: "CardigannSettings",
    protocol: "torrent",
    privacy: "public",
    language: "en-US",
    description: "Anime",
    enable: false,
    id: 0,
    fields: fields,
  },
  { name: "1337x", implementation: "Cardigann", protocol: "torrent", privacy: "public", enable: false, id: 0, fields: [] },
];
const existing = { id: 5, name: "Mi Nyaa", enable: true, protocol: "torrent", priority: 25, appProfileId: 1, fields: [{ name: "apiKey", label: "API Key", type: "password", value: "********" }] };

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      prowlarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v1/indexer" && req.method === "GET") return [existing];
        if (req.path === "/api/v1/indexerstatus") return [];
        if (req.path === "/api/v1/health") return [];
        if (req.path === "/api/v1/indexer/schema") return schema;
        if (req.path === "/api/v1/appprofile") return [{ id: 1, name: "Standard" }];
        if (req.path === "/api/v1/indexerstats")
          return {
            indexers: [
              { indexerId: 5, indexerName: "Mi Nyaa", numberOfQueries: 10, numberOfGrabs: 2, numberOfFailedQueries: 1, averageResponseTime: 320.4 },
              { indexerId: 6, indexerName: "Otro", numberOfQueries: 30, numberOfGrabs: 0 },
            ],
          };
        if (req.path === "/api/v1/history")
          return {
            page: 1,
            pageSize: 50,
            totalRecords: 120,
            records: [{ id: 1, indexerId: 5, date: "2024-01-01T10:00:00Z", successful: false, eventType: "indexerQuery", data: { query: "frieren", source: "Sonarr" } }],
          };
        if (req.path === "/api/v1/applications")
          return [
            { id: 1, name: "Radarr", implementationName: "Radarr", syncLevel: "fullSync" },
            { id: 2, name: "Sonarr", implementationName: "Sonarr", syncLevel: "disabled" },
          ];
        if (req.method === "POST" && req.path === "/api/v1/indexer")
          throw { kind: "Http", status: 400, message: '[{"propertyName":"ApiKey","errorMessage":"Invalid API Key"}]' };
        if (req.method === "PUT") return req.body.value;
        return {};
      },
    },
  });
  return calls;
}

test("añadir un indexador: elegir del esquema, rellenar campos dinámicos y ver el motivo si Prowlarr lo rechaza", async () => {
  const calls = backend();
  renderApp("/indexadores");
  await userEvent.click(await screen.findByRole("button", { name: "Añadir indexador" }));
  const dialog = await screen.findByRole("dialog", { name: "Añadir indexador" });
  await userEvent.type(await within(dialog).findByRole("textbox", { name: "Busca el indexador por su nombre…" }), "nyaa");
  expect(within(dialog).queryByText("1337x")).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: /Nyaa\.si/ }));

  const form = await screen.findByRole("dialog", { name: "Añadir · Nyaa.si" });
  expect(within(form).getByText("Necesita cuenta")).toBeInTheDocument();
  expect(within(form).queryByLabelText("Sort")).not.toBeInTheDocument();
  await userEvent.type(within(form).getByLabelText("API Key"), "secreta");
  await userEvent.click(within(form).getByRole("checkbox", { name: "Mostrar opciones avanzadas" }));
  await userEvent.selectOptions(within(form).getByLabelText("Sort"), "1");
  await userEvent.click(within(form).getByRole("button", { name: "Guardar" }));

  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path === "/api/v1/indexer")).toBeTruthy());
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v1/indexer").body.value;
  expect(post).toMatchObject({ name: "Nyaa.si", implementation: "Cardigann", configContract: "CardigannSettings", enable: true, priority: 25, appProfileId: 1 });
  expect(post.id).toBeUndefined();
  expect(post.fields.find((f: any) => f.name === "apiKey").value).toBe("secreta");
  expect(post.fields.find((f: any) => f.name === "sort").value).toBe(1);
  expect(await screen.findByText("Invalid API Key")).toBeInTheDocument();
  // Rechazado: el diálogo sigue abierto para corregirlo.
  expect(screen.getByRole("dialog", { name: "Añadir · Nyaa.si" })).toBeInTheDocument();
});

test("editar y borrar un indexador", async () => {
  const calls = backend();
  renderApp("/indexadores");
  await userEvent.click(await screen.findByRole("button", { name: "Editar Mi Nyaa" }));
  const form = await screen.findByRole("dialog", { name: "Editar · Mi Nyaa" });
  const priority = within(form).getByLabelText("Prioridad");
  await userEvent.clear(priority);
  await userEvent.type(priority, "10");
  await userEvent.click(within(form).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT")).toMatchObject({
    path: "/api/v1/indexer/5",
    body: { value: { id: 5, priority: 10, fields: existing.fields } },
  });

  await userEvent.click(screen.getByRole("button", { name: "Borrar: Mi Nyaa" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Borrar indexador" })).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v1/indexer/5"));
});

test("estadísticas: tabla por indexador con totales", async () => {
  backend();
  renderApp("/indexadores/estadisticas");
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row");
  // Cabecera, dos indexadores (más búsquedas primero) y total.
  expect(rows).toHaveLength(4);
  expect(rows[1]).toHaveTextContent("Otro");
  expect(rows[2]).toHaveTextContent("Mi Nyaa");
  expect(rows[2]).toHaveTextContent("320 ms");
  expect(rows[3]).toHaveTextContent("Total40");
});

test("historial: filtra por tipo y pagina", async () => {
  const calls = backend();
  renderApp("/indexadores/historial");
  expect(await screen.findByText("frieren")).toBeInTheDocument();
  expect(screen.getByText("Mi Nyaa")).toBeInTheDocument();
  expect(screen.getByLabelText("Ha fallado")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Descarga" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v1/history" && c.query.some(([k, v]: string[]) => k === "eventType" && v === "1"))).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
  await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/v1/history" && c.query.some(([k, v]: string[]) => k === "page" && v === "2"))).toBe(true));
  expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
});

test("aplicaciones: nivel de sincronización y sincronizar ahora", async () => {
  const calls = backend();
  renderApp("/indexadores/aplicaciones");
  expect(await screen.findByText("Sincronización completa")).toBeInTheDocument();
  expect(screen.getByText("Desactivada")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v1/command")?.body.value).toEqual({ name: "ApplicationIndexerSync" }));
});
