import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const torrents = [
  {
    hash: "h1",
    name: "Dune.2024",
    size: 100,
    progress: 0.5,
    dlspeed: 0,
    upspeed: 0,
    eta: 60,
    state: "downloading",
    category: "radarr",
    num_seeds: 3,
    dl_limit: 0,
    up_limit: 0,
  },
  {
    hash: "h2",
    name: "Shogun.S01",
    size: 100,
    progress: 1,
    dlspeed: 0,
    upspeed: 0,
    eta: 0,
    state: "uploading",
    category: "",
    num_seeds: 1,
  },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      qbittorrent: (req) => {
        calls.push(req);
        if (req.path === "/api/v2/torrents/info") return torrents;
        if (req.path === "/api/v2/torrents/categories") return { radarr: {}, sonarr: {} };
        if (req.path === "/api/v2/torrents/properties")
          return {
            save_path: "/dl/movies",
            addition_date: 1700000000,
            completion_date: -1,
            share_ratio: 0.5,
            total_downloaded: 50,
            total_uploaded: 25,
            seeds: 3,
            seeds_total: 10,
            peers: 1,
            peers_total: 4,
            dl_limit: -1,
            up_limit: 2048,
          };
        if (req.path === "/api/v2/torrents/files")
          return [
            { index: 0, name: "Dune.mkv", size: 90, progress: 0.5, priority: 1 },
            { index: 1, name: "Sample.mkv", size: 10, progress: 0, priority: 1 },
          ];
        if (req.path === "/api/v2/torrents/trackers")
          return [
            { url: "** [DHT] **", status: 2, tier: -1, num_seeds: 0, num_leeches: 0, num_peers: 0, msg: "" },
            {
              url: "https://tracker.example/announce",
              status: 4,
              tier: 0,
              num_seeds: 5,
              num_leeches: 2,
              num_peers: 7,
              msg: "unregistered torrent",
            },
          ];
        if (req.path === "/api/v2/sync/torrentPeers")
          return {
            peers: { "1.2.3.4:5000": { ip: "1.2.3.4", port: 5000, client: "qBittorrent 5.0", progress: 1, dl_speed: 1024, up_speed: 0 } },
          };
        return "Ok.";
      },
    },
  });
  return calls;
}

const form = (c: any) => Object.fromEntries(c.body.value);

test("ficha del torrent: general, archivos (no descargar), trackers y pares", async () => {
  const calls = backend();
  renderApp("/descargas");
  await userEvent.click(await screen.findByRole("button", { name: "Ver detalles de Dune.2024" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune.2024" });
  expect(await within(dialog).findByText("/dl/movies")).toBeInTheDocument();
  expect(within(dialog).getByText("3 (de 10)")).toBeInTheDocument();

  await userEvent.click(within(dialog).getByRole("tab", { name: "Archivos" }));
  await userEvent.click(await within(dialog).findByRole("checkbox", { name: "Descargar: Sample.mkv" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v2/torrents/filePrio")).toBeTruthy());
  expect(form(calls.find((c) => c.path === "/api/v2/torrents/filePrio"))).toEqual({ hash: "h1", id: "1", priority: "0" });

  await userEvent.click(within(dialog).getByRole("tab", { name: "Trackers" }));
  expect(await within(dialog).findByText("unregistered torrent")).toBeInTheDocument();
  expect(within(dialog).getByText("No funciona")).toBeInTheDocument();
  expect(within(dialog).queryByText("** [DHT] **")).not.toBeInTheDocument();

  await userEvent.click(within(dialog).getByRole("tab", { name: "Pares" }));
  expect(await within(dialog).findByText("qBittorrent 5.0")).toBeInTheDocument();
});

test("varios seleccionados: cambiar categoría y limitar velocidad", async () => {
  const calls = backend();
  renderApp("/descargas");
  await userEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar todos" }));
  await userEvent.click(screen.getByRole("button", { name: "Cambiar categoría" }));
  const cat = await screen.findByRole("dialog", { name: "Cambiar categoría de 2 torrents" });
  await userEvent.selectOptions(within(cat).getByLabelText("Categoría"), "sonarr");
  await userEvent.click(within(cat).getByRole("button", { name: "Aplicar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v2/torrents/setCategory")).toBeTruthy());
  expect(form(calls.find((c) => c.path === "/api/v2/torrents/setCategory"))).toEqual({ hashes: "h1|h2", category: "sonarr" });

  await userEvent.click(screen.getByRole("button", { name: "Limitar velocidad" }));
  const lim = await screen.findByRole("dialog", { name: "Limitar velocidad de 2 torrents" });
  await userEvent.clear(within(lim).getByLabelText("Bajada máxima (KiB/s)"));
  await userEvent.type(within(lim).getByLabelText("Bajada máxima (KiB/s)"), "500");
  await userEvent.click(within(lim).getByRole("button", { name: "Aplicar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v2/torrents/setUploadLimit")).toBeTruthy());
  expect(form(calls.find((c) => c.path === "/api/v2/torrents/setDownloadLimit"))).toEqual({ hashes: "h1|h2", limit: String(500 * 1024) });
  expect(form(calls.find((c) => c.path === "/api/v2/torrents/setUploadLimit"))).toEqual({ hashes: "h1|h2", limit: "0" });
});
