import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { retryText, throttleReason } from "@/lib/bazarrProviders";

function backend(enabled: string[]) {
  const calls: any[] = [];
  let current = enabled;
  mockBackend({
    api: {
      bazarr: (req) => {
        calls.push(req);
        if (req.path === "/api/system/settings" && req.method === "POST") {
          const pairs: [string, string][] = req.body.value;
          const list = pairs.filter(([k]) => k === "settings-general-enabled_providers").map(([, v]) => v);
          if (list.length) current = list.filter(Boolean);
          return null;
        }
        if (req.path === "/api/system/settings")
          return {
            general: { enabled_providers: current },
            opensubtitlescom: { username: "vitor", password: "x", use_hash: true },
            futurosubs: { token: "abc", fast: true },
          };
        if (req.path === "/api/providers" && req.method === "GET")
          return {
            data: [
              { name: "opensubtitlescom", status: "DownloadLimitExceeded", retry: "in 3 hours" },
              { name: "subtis", status: "Good", retry: "-" },
            ],
          };
        return null;
      },
    },
  });
  return calls;
}

test("lista los activos con su estado y desbloquea todos", async () => {
  const calls = backend(["opensubtitlescom", "subtis", "futurosubs"]);
  renderApp("/proveedores");
  expect(await screen.findByText("OpenSubtitles.com")).toBeInTheDocument();
  expect(screen.getByText("Bloqueado: límite de descargas alcanzado · vuelve en 3 horas")).toBeInTheDocument();
  expect(screen.getByText("Funciona")).toBeInTheDocument();
  // Activo pero desconocido para la versión de Bazarr.
  expect(screen.getByText("Tu Bazarr no lo reconoce")).toBeInTheDocument();
  expect(screen.getByText("3 activos")).toBeInTheDocument();
  expect(screen.getByText("· 1 bloqueado")).toBeInTheDocument();
  // Los no activos solo salen en «Todos».
  expect(screen.queryByText("Addic7ed")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Desbloquear todos/ }));
  await waitFor(() => expect(calls.some((c) => c.path === "/api/providers" && c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST" && c.path === "/api/providers").query).toEqual([["action", "reset"]]);
});

test("desactiva uno y activa otro sin campos", async () => {
  const calls = backend(["opensubtitlescom", "subtis"]);
  renderApp("/proveedores");
  await userEvent.click(await screen.findByRole("switch", { name: "Desactivar Subtis" }));
  const posts = () => calls.filter((c) => c.method === "POST" && c.path === "/api/system/settings");
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0].body).toEqual({ type: "form", value: [["settings-general-enabled_providers", "opensubtitlescom"]] });

  await userEvent.click(screen.getByRole("tab", { name: /Todos/ }));
  await userEvent.type(screen.getByLabelText("Buscar proveedor…"), "subtitulamos");
  await userEvent.click(await screen.findByRole("switch", { name: "Activar Subtitulamos.tv" }));
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(posts()[1].body.value).toEqual([
    ["settings-general-enabled_providers", "opensubtitlescom"],
    ["settings-general-enabled_providers", "subtitulamostv"],
  ]);
});

test("edita las credenciales y activar uno con campos abre sus ajustes", async () => {
  const calls = backend(["opensubtitlescom"]);
  renderApp("/proveedores");
  await userEvent.click(await screen.findByRole("button", { name: "Ajustes de OpenSubtitles.com" }));
  const dialog = await screen.findByRole("dialog");
  const userBox = within(dialog).getByLabelText("Usuario");
  expect(userBox).toHaveValue("vitor");
  await userEvent.clear(userBox);
  await userEvent.type(userBox, "yo@correo.es");
  expect(within(dialog).getByRole("alert")).toHaveTextContent("no el correo");
  expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeDisabled();
  await userEvent.clear(userBox);
  await userEvent.type(userBox, "nuevo");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  const post = () => calls.filter((c) => c.method === "POST" && c.path === "/api/system/settings");
  await waitFor(() => expect(post()).toHaveLength(1));
  expect(post()[0].body.value).toEqual([
    ["settings-opensubtitlescom-username", "nuevo"],
    ["settings-opensubtitlescom-password", "x"],
    ["settings-opensubtitlescom-use_hash", "true"],
    ["settings-opensubtitlescom-include_ai_translated", "false"],
    ["settings-opensubtitlescom-include_machine_translated", "false"],
  ]);

  await userEvent.click(screen.getByRole("tab", { name: /Todos/ }));
  await userEvent.click(await screen.findByRole("switch", { name: "Activar SubDL" }));
  const d2 = await screen.findByRole("dialog");
  await userEvent.type(within(d2).getByLabelText("API key"), "k1");
  await userEvent.click(within(d2).getByRole("button", { name: "Activar y guardar" }));
  await waitFor(() => expect(post()).toHaveLength(2));
  expect(post()[1].body.value).toEqual([
    ["settings-subdl-api_key", "k1"],
    ["settings-subdl-ai_translate", "false"],
    ["settings-subdl-include_ai_translated", "false"],
    ["settings-general-enabled_providers", "opensubtitlescom"],
    ["settings-general-enabled_providers", "subdl"],
  ]);
});

test("textos del bloqueo en español", () => {
  expect(throttleReason("TooManyRequests")).toBe("demasiadas peticiones");
  expect(throttleReason("requests.exceptions.ReadTimeout")).toBe("tarda demasiado en responder");
  expect(throttleReason("RaroError")).toBe("RaroError");
  expect(retryText("in an hour")).toBe("en una hora");
  expect(retryText("in 10 minutes")).toBe("en 10 minutos");
  expect(retryText("tomorrow")).toBe("mañana");
  expect(retryText("-")).toBeNull();
});
