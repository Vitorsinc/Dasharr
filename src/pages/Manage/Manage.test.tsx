import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { profile } from "@/test/fixtures";

function backend(over: Record<string, unknown> = {}) {
  const calls: any[] = [];
  const data: Record<string, unknown> = {
    "/api/v3/qualityprofile": [profile()],
    "/api/v3/qualityprofile/schema": { ...profile(), id: 0, name: "" },
    "/api/v3/customformat": [
      {
        id: 1,
        name: "x265",
        includeCustomFormatWhenRenaming: false,
        specifications: [{ name: "x265", implementation: "ReleaseTitleSpecification", negate: false, required: true, fields: [{ name: "value", value: "x265" }] }],
      },
      { id: 2, name: "HDR", specifications: [] },
    ],
    "/api/v3/tag": [
      { id: 1, label: "4k" },
      { id: 2, label: "kids" },
    ],
    "/api/v3/tag/detail": [
      { id: 1, label: "4k", movieIds: [1, 2], delayProfileIds: [2] },
      { id: 2, label: "kids", movieIds: [] },
    ],
    "/api/v3/rootfolder": [{ id: 3, path: "/movies", freeSpace: 2 * 1024 ** 4, unmappedFolders: [{ name: "x", path: "/movies/x" }] }],
    "/api/v3/delayprofile": [
      { id: 1, enableUsenet: true, enableTorrent: true, preferredProtocol: "torrent", usenetDelay: 0, torrentDelay: 60, bypassIfHighestQuality: true, order: 2, tags: [] },
      { id: 2, enableUsenet: false, enableTorrent: true, preferredProtocol: "torrent", usenetDelay: 0, torrentDelay: 0, bypassIfHighestQuality: true, order: 1, tags: [1] },
    ],
    ...over,
  };
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.method === "GET" && req.path in data) return data[req.path];
        if (req.method === "POST" || req.method === "PUT") return { id: 99, ...req.body?.value };
        return {};
      },
    },
  });
  return calls;
}

test("perfiles: editar calidades, orden, límite y puntuación de formatos", async () => {
  const calls = backend();
  renderApp("/gestion/radarr");
  expect(await screen.findByRole("heading", { name: "Gestión de Radarr" })).toBeInTheDocument();
  expect(await screen.findByText(/2 calidades · Mejora hasta Bluray-1080p/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Editar perfil · HD" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar perfil · HD" });
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "Permitir Bluray-2160p" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Bajar Bluray-1080p" }));
  await userEvent.selectOptions(within(dialog).getByLabelText("Mejorar hasta"), "19");
  const score = within(dialog).getByRole("spinbutton", { name: "Puntuación de x265" });
  await userEvent.clear(score);
  await userEvent.type(score, "-25");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  const put = calls.find((c) => c.method === "PUT");
  expect(put.path).toBe("/api/v3/qualityprofile/4");
  expect(put.body.value.cutoff).toBe(19);
  expect(put.body.value.items.map((i: any) => i.quality?.id ?? i.id)).toEqual([1, 7, 1000, 19]);
  expect(put.body.value.items[3].allowed).toBe(true);
  expect(put.body.value.formatItems.find((f: any) => f.format === 1).score).toBe(-25);
});

test("perfiles: crear desde la plantilla y avisar de lo que falta", async () => {
  const calls = backend();
  renderApp("/gestion/radarr/perfiles");
  await userEvent.click(await screen.findByRole("button", { name: "Perfil nuevo" }));
  const dialog = await screen.findByRole("dialog", { name: "Crear perfil" });
  const name = within(dialog).getByLabelText("Nombre");
  await userEvent.clear(name);
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Ponle un nombre.");
  expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeDisabled();
  await userEvent.type(name, "Anime");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
  const post = calls.find((c) => c.method === "POST");
  expect(post.path).toBe("/api/v3/qualityprofile");
  expect(post.body.value).toMatchObject({ name: "Anime" });
  expect(post.body.value.id).toBeUndefined();
});

test("perfiles: un error de validación del *arr se enseña con su motivo", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/qualityprofile" && req.method === "GET") return [profile()];
        if (req.method === "DELETE")
          throw { kind: "Http", status: 400, message: '[{"propertyName":"Id","errorMessage":"Profile [HD] is in use"}]' };
        return [];
      },
    },
  });
  renderApp("/gestion/radarr");
  await userEvent.click(await screen.findByRole("button", { name: "Borrar: HD" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar perfil de calidad" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/qualityprofile/4"));
  expect(await screen.findByText("Profile [HD] is in use")).toBeInTheDocument();
});

test("formatos: lista con uso en perfiles, importar JSON y borrar", async () => {
  const calls = backend();
  renderApp("/gestion/radarr/formatos");
  expect(await screen.findByText("x265")).toBeInTheDocument();
  expect(await screen.findByText(/0 condiciones · puntúa en 1 perfil/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Importar JSON" }));
  const dialog = await screen.findByRole("dialog", { name: "Importar formato personalizado" });
  const area = within(dialog).getByLabelText("JSON");
  await userEvent.click(area);
  await userEvent.paste("{ roto");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("El texto no es un JSON válido.");
  await userEvent.clear(area);
  await userEvent.paste(
    JSON.stringify({ name: "DV", specifications: [{ name: "DV", implementation: "ReleaseTitleSpecification", fields: { value: "DV" } }] }),
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
  expect(calls.find((c) => c.method === "POST").body.value).toMatchObject({
    name: "DV",
    specifications: [{ implementation: "ReleaseTitleSpecification", fields: [{ name: "value", value: "DV" }] }],
  });

  await userEvent.click(screen.getByRole("button", { name: "Borrar: HDR" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Borrar formato personalizado" })).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/customformat/2"));
});

test("etiquetas: uso, crear, renombrar y borrar", async () => {
  const calls = backend();
  renderApp("/gestion/radarr/etiquetas");
  expect(await screen.findByText("2 en la biblioteca · 1 en ajustes")).toBeInTheDocument();
  expect(screen.getByText("Sin usar")).toBeInTheDocument();

  await userEvent.type(screen.getByRole("textbox", { name: "Etiqueta nueva" }), "anime");
  await userEvent.click(screen.getByRole("button", { name: "Añadir etiqueta" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST")?.body.value).toEqual({ label: "anime" }));

  await userEvent.click(screen.getByRole("button", { name: "Renombrar «kids»" }));
  const rename = await screen.findByRole("dialog", { name: "Renombrar «kids»" });
  await userEvent.clear(within(rename).getByLabelText("Nombre"));
  await userEvent.type(within(rename).getByLabelText("Nombre"), "niños");
  await userEvent.click(within(rename).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body.value).toEqual({ id: 2, label: "niños" }));

  await userEvent.click(screen.getByRole("button", { name: "Borrar: 4k" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Borrar etiqueta" })).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/tag/1"));
});

test("carpetas raíz: añadir y quitar con confirmación", async () => {
  const calls = backend();
  renderApp("/gestion/radarr/carpetas");
  expect(await screen.findByText("/movies")).toBeInTheDocument();
  expect(screen.getByText("2 TB libres")).toBeInTheDocument();
  expect(screen.getByText("1 carpeta sin importar")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: "Ruta en el servidor" }), "/movies4k");
  await userEvent.click(screen.getByRole("button", { name: "Añadir carpeta" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "POST")?.body.value).toEqual({ path: "/movies4k" }));
  await userEvent.click(screen.getByRole("button", { name: "Quitar: /movies" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Quitar carpeta raíz" })).getByRole("button", { name: "Quitar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/rootfolder/3"));
});

test("retraso: lista en orden, el de por defecto no se borra, y editar", async () => {
  const calls = backend();
  renderApp("/gestion/radarr/retraso");
  const list = await screen.findByRole("list", { name: "Retraso" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("4k");
  expect(rows[1]).toHaveTextContent("Por defecto");
  expect(rows[1]).toHaveTextContent("Torrent: 1 h");
  expect(within(rows[1]).queryByRole("button", { name: /^Borrar/ })).not.toBeInTheDocument();

  await userEvent.click(within(rows[1]).getByRole("button", { name: "Editar perfil de retraso: Por defecto" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar perfil de retraso" });
  const delay = within(dialog).getByLabelText("Retraso torrents (minutos)");
  await userEvent.clear(delay);
  await userEvent.type(delay, "120");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/api/v3/delayprofile/1", body: { value: { torrentDelay: 120, tags: [] } } });
});
