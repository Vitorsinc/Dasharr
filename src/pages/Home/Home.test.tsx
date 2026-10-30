import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { allConfigured, mockBackend, renderApp, view } from "@/test/utils";

test("Inicio: tarjetas de servicio, descargas activas y próximos estrenos; un servicio caído solo afecta a su tarjeta", async () => {
  const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
  mockBackend({
    api: {
      radarr: (r) =>
        r.path === "/api/v3/system/status"
          ? { version: "5.2.0" }
          : r.path === "/api/v3/diskspace"
            ? [
                { path: "/", freeSpace: 40e9, totalSpace: 100e9 },
                { path: "/data", freeSpace: 1024 ** 4, totalSpace: 4 * 1024 ** 4 },
              ]
            : [{ id: 1, title: "Estreno", year: 2026, hasFile: false, digitalRelease: soon }],
      sonarr: () => Promise.reject({ kind: "Network", message: "timeout" }),
      prowlarr: () => ({ version: "1.20.0" }),
      bazarr: () => ({ data: { bazarr_version: "1.4.5" } }),
      qbittorrent: (r) =>
        r.path === "/api/v2/app/version"
          ? "v4.6.2"
          : [
              ...Array.from({ length: 6 }, (_, i) => ({
                hash: `a${i}`,
                name: `Activo ${i}`,
                progress: 0.5,
                dlspeed: 1024,
                upspeed: 0,
                eta: 60,
                state: "downloading",
              })),
              { hash: "s", name: "Sembrando", progress: 1, dlspeed: 0, upspeed: 0, eta: 0, state: "uploading" },
            ],
    },
  });
  renderApp("/");
  const radarr = await screen.findByRole("link", { name: "Radarr" });
  expect(await within(radarr).findByText("v5.2.0")).toBeInTheDocument();
  const sonarr = screen.getByRole("link", { name: "Sonarr" });
  expect(await within(sonarr).findByText(/No se puede conectar con el servidor/)).toBeInTheDocument();
  expect(within(sonarr).getByText("Sin conexión")).toBeInTheDocument();
  expect(await within(screen.getByRole("link", { name: "qBittorrent" })).findByText("v4.6.2")).toBeInTheDocument();
  expect(await screen.findByText("Activo 4")).toBeInTheDocument();
  expect(screen.queryByText("Activo 5")).not.toBeInTheDocument();
  expect(screen.queryByText("Sembrando")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Estreno" })).toBeInTheDocument();

  // Espacio en disco: pequeño arriba a la derecha (el disco de contenido); al pulsarlo, todos los discos.
  const disk = await screen.findByRole("button", { name: "Espacio en disco" });
  expect(within(disk).getByText("1 TB libres")).toBeInTheDocument();
  await userEvent.click(disk);
  const panel = screen.getByRole("dialog", { name: "Espacio en disco" });
  expect(within(panel).getByText("1 TB / 4 TB")).toBeInTheDocument();
  expect(within(panel).getByText("Sistema (/)")).toBeInTheDocument();
});

test("Inicio: el botón de cada tarjeta abre la web del servicio, externa si hay y si no la local", async () => {
  mockBackend({
    settings: {
      ...allConfigured(),
      radarr: view({ local: "http://h:7878", external: "https://movies.x.org" }),
      bazarr: { ...view(), config: { localUrl: null, externalUrl: null, enabled: false } },
    },
    api: {
      radarr: (r) => (r.path.endsWith("/status") ? { version: "5.2.0" } : []),
      sonarr: (r) => (r.path.endsWith("/status") ? { version: "4.0.0" } : []),
    },
  });
  renderApp("/");
  await userEvent.click(await screen.findByRole("button", { name: "Abrir Radarr en el navegador" }));
  expect(openUrl).toHaveBeenCalledWith("https://movies.x.org");
  await userEvent.click(screen.getByRole("button", { name: "Abrir Sonarr en el navegador" }));
  expect(openUrl).toHaveBeenCalledWith("http://h:8989");
  await userEvent.click(screen.getByRole("button", { name: "Abrir Plex en el navegador" }));
  expect(openUrl).toHaveBeenCalledWith("http://h:32400/web");
  expect(screen.queryByRole("button", { name: "Abrir Bazarr en el navegador" })).not.toBeInTheDocument();
});
