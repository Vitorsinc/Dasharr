import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const torrents = [
  {
    hash: "h1",
    name: "Dune.Part.Two.2024.2160p",
    size: 20 * 1024 ** 3,
    progress: 0.425,
    dlspeed: 5 * 1024 ** 2,
    upspeed: 0,
    eta: 3661,
    state: "downloading",
    category: "radarr",
    num_seeds: 40,
  },
  {
    hash: "h2",
    name: "Shogun.S01E01.1080p",
    size: 2 * 1024 ** 3,
    progress: 1,
    dlspeed: 0,
    upspeed: 1024,
    eta: 8640000,
    state: "uploading",
    category: "sonarr",
    num_seeds: 10,
  },
  {
    hash: "h3",
    name: "Pausado.iso",
    size: 1024,
    progress: 0.1,
    dlspeed: 0,
    upspeed: 0,
    eta: 8640000,
    state: "stoppedDL",
    category: "",
    num_seeds: 0,
  },
];

function backend() {
  const posts: { path: string; body: any }[] = [];
  mockBackend({
    api: {
      qbittorrent: (req) => {
        if (req.method === "POST") {
          posts.push({ path: req.path, body: req.body });
          return null;
        }
        if (req.path === "/api/v2/torrents/info") return torrents;
        if (req.path === "/api/v2/sync/maindata")
          return { server_state: { free_space_on_disk: 500 * 1024 ** 3, use_alt_speed_limits: false } };
        if (req.path === "/api/v2/torrents/categories") return { radarr: {}, sonarr: {} };
        return null;
      },
    },
  });
  return posts;
}

test("lista torrents con progreso y filtra por estado", async () => {
  backend();
  renderApp("/descargas");
  expect(await screen.findByText("Dune.Part.Two.2024.2160p")).toBeInTheDocument();
  expect(screen.getByText("42,5 %")).toBeInTheDocument();
  expect(screen.getByText("1 h 1 min")).toBeInTheDocument();
  expect(screen.getByText("500 GB")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Sembrando" }));
  expect(screen.queryByText("Dune.Part.Two.2024.2160p")).not.toBeInTheDocument();
  expect(screen.getByText("Shogun.S01E01.1080p")).toBeInTheDocument();
});

test("pausa varios seleccionados con hashes unidos por |", async () => {
  const posts = backend();
  renderApp("/descargas");
  await userEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar Dune.Part.Two.2024.2160p" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Shogun.S01E01.1080p" }));
  const bar = screen.getByText("2 seleccionados").parentElement!;
  await userEvent.click(within(bar).getByRole("button", { name: "Pausar" }));
  expect(posts[0]).toEqual({ path: "/api/v2/torrents/stop", body: { type: "form", value: [["hashes", "h1|h2"]] } });
});

test("borrar pide confirmación y respeta la casilla de archivos", async () => {
  const posts = backend();
  renderApp("/descargas");
  const row = (await screen.findByText("Pausado.iso")).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
  expect(posts).toHaveLength(0);
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "Borrar también los archivos" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
  expect(posts[0]).toEqual({
    path: "/api/v2/torrents/delete",
    body: {
      type: "form",
      value: [
        ["hashes", "h3"],
        ["deleteFiles", "true"],
      ],
    },
  });
});

test("sin configurar muestra acceso a Ajustes", async () => {
  mockBackend({
    settings: {
      radarr: null,
      sonarr: null,
      prowlarr: null,
      bazarr: null,
      qbittorrent: { config: { enabled: true }, hasApiKey: false, hasPassword: false, hasProxyPassword: false },
    } as any,
  });
  renderApp("/descargas");
  expect(await screen.findByText("qBittorrent no está configurado")).toBeInTheDocument();
});
