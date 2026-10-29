import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp, view } from "@/test/utils";
import type { ServiceKind, ServiceSettingsView } from "@/lib/types";

const settings = {
  radarr: view({ local: "http://192.168.1.50:7878", external: "https://radarr.x.com" }),
  sonarr: view({}, { hasApiKey: false }),
  prowlarr: view({}, { hasApiKey: false }),
  bazarr: view({}, { hasApiKey: false }),
  qbittorrent: view({}, { hasApiKey: false }),
} as Record<ServiceKind, ServiceSettingsView>;

test("carga la configuración y prueba la conexión con éxito", async () => {
  const mock = mockBackend({ settings, commands: { test_service: () => "5.2.0" } });
  renderApp("/ajustes");
  const radarr = await screen.findByRole("region", { name: "Radarr" });
  expect(within(radarr).getByDisplayValue("http://192.168.1.50:7878")).toBeInTheDocument();
  expect(within(radarr).getByPlaceholderText("•••••••• (guardada)")).toBeInTheDocument();
  await userEvent.click(within(radarr).getByRole("button", { name: "Probar conexión" }));
  expect(await within(radarr).findByText("Conectado · 5.2.0")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith("test_service", {
    service: "radarr",
    config: { localUrl: "http://192.168.1.50:7878", externalUrl: "https://radarr.x.com", enabled: true },
    secrets: { apiKey: undefined, username: undefined, password: undefined, proxyUsername: "", proxyPassword: undefined },
  });
});

test("muestra el error de API key incorrecta", async () => {
  mockBackend({ settings, commands: { test_service: () => Promise.reject({ kind: "Unauthorized" }) } });
  renderApp("/ajustes");
  const radarr = await screen.findByRole("region", { name: "Radarr" });
  await userEvent.click(within(radarr).getByRole("button", { name: "Probar conexión" }));
  expect(await within(radarr).findByText(/API key o credenciales incorrectas\. Cópiala de Radarr/)).toBeInTheDocument();
});

test("guarda con semántica de parche: el secreto no tocado no se envía", async () => {
  const save = vi.fn();
  mockBackend({ settings, commands: { save_service: save } });
  renderApp("/ajustes");
  const sonarr = await screen.findByRole("region", { name: "Sonarr" });
  await userEvent.type(within(sonarr).getByLabelText("Dirección local"), "http://h:8989");
  await userEvent.type(within(sonarr).getByLabelText(/API key/), "k123");
  await userEvent.click(within(sonarr).getByRole("button", { name: "Guardar" }));
  expect(save).toHaveBeenCalledWith({
    service: "sonarr",
    config: { localUrl: "http://h:8989", externalUrl: null, enabled: true },
    secrets: { apiKey: "k123", username: undefined, password: undefined, proxyUsername: "", proxyPassword: undefined },
  });
});

test("pide al menos una dirección", async () => {
  mockBackend({ settings });
  renderApp("/ajustes");
  const bazarr = await screen.findByRole("region", { name: "Bazarr" });
  await userEvent.click(within(bazarr).getByRole("button", { name: "Probar conexión" }));
  expect(await within(bazarr).findByText("Indica al menos una dirección.")).toBeInTheDocument();
});

test("importa la configuración desde un archivo JSON", async () => {
  const save = vi.fn();
  let current = settings;
  mockBackend({
    commands: {
      save_service: (a: any) => {
        save(a);
        current = { ...current, [a.service]: view({ local: a.config.localUrl }) };
      },
      get_settings: () => current,
    },
  });
  renderApp("/ajustes");
  await screen.findByRole("region", { name: "Radarr" });
  const file = new File([JSON.stringify({ services: { sonarr: { localUrl: "http://h:8989", apiKey: "abc" } } })], "dasharr-config.json", {
    type: "application/json",
  });
  await userEvent.upload(screen.getByLabelText("Importar desde archivo"), file);
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      service: "sonarr",
      config: { localUrl: "http://h:8989", externalUrl: null, enabled: true },
      secrets: { apiKey: "abc", username: undefined, password: undefined, proxyUsername: undefined, proxyPassword: undefined },
    }),
  );
  const sonarr = await screen.findByRole("region", { name: "Sonarr" });
  expect(await within(sonarr).findByDisplayValue("http://h:8989")).toBeInTheDocument();
});

test("buscar actualizaciones avisa si ya está al día", async () => {
  mockBackend({ commands: { check_update: () => null } });
  renderApp("/ajustes");
  await userEvent.click(await screen.findByRole("button", { name: "Buscar actualizaciones" }));
  expect(await screen.findByText("Tienes la última versión")).toBeInTheDocument();
});
