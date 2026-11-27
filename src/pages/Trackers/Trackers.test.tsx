import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { mockBackend, renderApp } from "@/test/utils";
import type { TrackerDeals, TrackerStats } from "@/api/trackers";

const stats: TrackerStats[] = [
  {
    indexerId: 1,
    name: "Aither (API)",
    siteUrl: "https://aither.cc/",
    status: "ok",
    message: null,
    user: {
      username: "vitor",
      group: "Power User",
      uploaded: 1.25 * 1024 ** 4,
      downloaded: 512 * 1024 ** 3,
      ratio: 2.5,
      buffer: -3 * 1024 ** 3,
      bufferInfinite: false,
      seeding: 312,
      leeching: 0,
      seedbonus: 15234.5,
      hitAndRuns: 0,
    },
  },
  { indexerId: 2, name: "Otro", siteUrl: "https://otro/", status: "unsupported", message: "este tracker no ofrece estadísticas por la API", user: null },
];

test("muestra las estadísticas y los trackers sin API", async () => {
  mockBackend({ commands: { unit3d_stats: () => stats, unit3d_deals: () => [] } });
  renderApp("/trackers");
  const card = await screen.findByRole("button", { name: "Aither (API)" });
  expect(card).toHaveTextContent("Power User");
  expect(card).toHaveTextContent("2,5");
  expect(card).toHaveTextContent("1,3 TB");
  expect(card).toHaveTextContent("-3 GB");
  expect(card).toHaveTextContent("312");
  expect(screen.getByText("Otro")).toBeInTheDocument();
  expect(screen.getByText("No disponible")).toBeInTheDocument();
});

test("el icono de la esquina abre la web del tracker", async () => {
  mockBackend({ commands: { unit3d_stats: () => stats, unit3d_deals: () => [] } });
  renderApp("/trackers");
  await userEvent.click(await screen.findByRole("button", { name: "Abrir la web del tracker: Aither (API)" }));
  expect(openUrl).toHaveBeenCalledWith("https://aither.cc/");
  expect(screen.getByRole("button", { name: "Abrir la web del tracker: Otro" })).toBeInTheDocument();
});

test("avisa si Prowlarr no tiene trackers UNIT3D", async () => {
  mockBackend({ commands: { unit3d_stats: () => [] } });
  renderApp("/trackers");
  expect(await screen.findByText("Prowlarr no tiene ningún tracker UNIT3D con API key.")).toBeInTheDocument();
});

const deal = (id: number, name: string, freeleech: number, doubleUpload: boolean, seeders: number) => ({
  id,
  name,
  category: "Movies",
  releaseType: "Remux",
  resolution: "2160p",
  size: 50 * 1024 ** 3,
  freeleech,
  doubleUpload,
  seeders,
  leechers: 1,
  completed: 10,
  createdAt: `2026-11-1${id}T10:00:00Z`,
  poster: null,
  tmdbId: 603,
  tvdbId: null,
  imdbId: null,
  detailsUrl: `https://aither.cc/torrents/${id}`,
});

const twoTrackers: TrackerStats[] = [stats[0], { ...stats[0], indexerId: 3, name: "Blutopia", siteUrl: "https://blutopia.cc/" }];
const deals: TrackerDeals[] = [
  { indexerId: 1, name: "Aither (API)", status: "ok", message: null, torrents: [deal(1, "Matrix 1999", 100, false, 5), deal(2, "Dune 2021", 0, true, 50)] },
  { indexerId: 3, name: "Blutopia", status: "ok", message: null, torrents: [deal(5, "Arrival 2016", 50, false, 9)] },
];

test("el freeleech va por tracker: se elige pulsando su tarjeta", async () => {
  mockBackend({ commands: { unit3d_stats: () => twoTrackers, unit3d_deals: () => deals } });
  renderApp("/trackers");
  const aither = await screen.findByRole("button", { name: "Aither (API)" });
  expect(aither).toHaveAttribute("aria-pressed", "true");
  expect(await within(aither).findByLabelText("2 en freeleech o ×2")).toHaveTextContent("2");
  const section = await screen.findByRole("region", { name: "Freeleech y doble subida" });
  expect(await within(section).findByRole("listitem", { name: "Matrix 1999" })).toHaveTextContent("Freeleech");
  expect(within(section).queryByRole("listitem", { name: "Arrival 2016" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Blutopia" }));
  expect(screen.getByRole("button", { name: "Blutopia" })).toHaveAttribute("aria-pressed", "true");
  const now = screen.getByRole("region", { name: "Freeleech y doble subida" });
  expect(now).toHaveTextContent("Blutopia");
  expect(within(now).getByRole("listitem", { name: "Arrival 2016" })).toHaveTextContent("Freeleech 50%");
  expect(within(now).queryByRole("listitem", { name: "Matrix 1999" })).not.toBeInTheDocument();
});

test("filtra por tipo, añade la película a Radarr y la manda a qBittorrent con su categoría", async () => {
  const added: { body: { value: { fields: [string, string][] } } }[] = [];
  const posted: unknown[] = [];
  const mock = mockBackend({
    commands: {
      unit3d_stats: () => stats,
      unit3d_deals: () => deals,
      unit3d_fetch_torrent: () => ({ type: "file", value: "ZDg6YW5ub3VuY2Ux" }),
    },
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/add") {
          added.push(req);
          return "Ok.";
        }
        return {};
      },
      radarr: (req) => {
        if (req.path === "/api/v3/movie" && req.method === "POST") {
          posted.push(req.body.value);
          return { ...req.body.value, id: 9 };
        }
        if (req.path === "/api/v3/movie") return [];
        if (req.path === "/api/v3/movie/lookup") return [{ title: "Dune", tmdbId: 603, year: 2021 }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "D:/Peliculas", freeSpace: 1 }, { id: 2, path: "E:/Cine", freeSpace: 1 }];
        if (req.path === "/api/v3/qualityprofile") return [{ id: 4, name: "HD" }, { id: 5, name: "4K" }];
        if (req.path === "/api/v3/downloadclient")
          return [{ implementation: "QBittorrent", enable: true, fields: [{ name: "movieCategory", value: "radarr" }] }];
        return [];
      },
    },
  });
  renderApp("/trackers");
  const section = await screen.findByRole("region", { name: "Freeleech y doble subida" });
  expect(await within(section).findByRole("listitem", { name: "Dune 2021" })).toHaveTextContent("×2 subida");
  await userEvent.click(within(section).getByRole("tab", { name: "Doble subida" }));
  expect(within(section).queryByRole("listitem", { name: "Matrix 1999" })).not.toBeInTheDocument();

  await userEvent.click(within(section).getByRole("button", { name: "Enviar a qBittorrent: Dune 2021" }));
  const dialog = await screen.findByRole("dialog", { name: "Añadir a Radarr y enviar" });
  expect(added).toHaveLength(0);
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Carpeta raíz" }), "E:/Cine");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Perfil de calidad" }), "4K");
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir y enviar" }));
  expect(await screen.findByText("Enviado a qBittorrent y «Dune» añadido a Radarr")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith("unit3d_fetch_torrent", { indexerId: 1, torrentId: 2 });
  expect(posted).toEqual([expect.objectContaining({ tmdbId: 603, qualityProfileId: 5, rootFolderPath: "E:/Cine", monitored: true, addOptions: { searchForMovie: false } })]);
  expect(added).toHaveLength(1);
  expect(added[0].body.value.fields).toContainEqual(["category", "radarr"]);
});

test("una serie del freeleech deja elegir carpeta, calidad y tipo antes de añadirla a Sonarr", async () => {
  const posted: unknown[] = [];
  const added: unknown[] = [];
  const show = { ...deal(7, "Shogun S01 2160p", 100, false, 20), category: "TV", tmdbId: null, tvdbId: 77 };
  mockBackend({
    commands: {
      unit3d_stats: () => stats,
      unit3d_deals: () => [{ indexerId: 1, name: "Aither (API)", status: "ok", message: null, torrents: [show] }],
      unit3d_fetch_torrent: () => ({ type: "file", value: "ZDg6YW5ub3VuY2Ux" }),
    },
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/add") added.push(req);
        return "Ok.";
      },
      sonarr: (req) => {
        if (req.path === "/api/v3/series" && req.method === "POST") {
          posted.push(req.body.value);
          return { ...req.body.value, id: 3 };
        }
        if (req.path === "/api/v3/series") return [];
        if (req.path === "/api/v3/series/lookup") return [{ title: "Shogun", tvdbId: 77, year: 2024, seasons: [] }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "D:/Series" }, { id: 2, path: "D:/Anime" }];
        if (req.path === "/api/v3/qualityprofile") return [{ id: 1, name: "HD" }, { id: 2, name: "Anime" }];
        return [];
      },
    },
  });
  renderApp("/trackers");
  const section = await screen.findByRole("region", { name: "Freeleech y doble subida" });
  await userEvent.click(await within(section).findByRole("button", { name: "Enviar a qBittorrent: Shogun S01 2160p" }));
  const dialog = await screen.findByRole("dialog", { name: "Añadir a Sonarr y enviar" });
  expect(within(dialog).getByRole("combobox", { name: "Carpeta raíz" })).toHaveValue("D:/Series");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Perfil de calidad" }), "Anime");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Monitorizar" }), "future");
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir y enviar" }));
  expect(await screen.findByText("Enviado a qBittorrent y «Shogun» añadido a Sonarr")).toBeInTheDocument();
  expect(posted).toEqual([expect.objectContaining({ tvdbId: 77, qualityProfileId: 2, rootFolderPath: "D:/Series", seriesType: "standard", addOptions: expect.objectContaining({ monitor: "future", searchForMissingEpisodes: false }) })]);
  expect(added).toHaveLength(1);
});

test("si se cancela el diálogo no se manda nada a qBittorrent", async () => {
  const added: unknown[] = [];
  mockBackend({
    commands: { unit3d_stats: () => stats, unit3d_deals: () => deals },
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/add") added.push(req);
        return "Ok.";
      },
      radarr: (req) => {
        if (req.path === "/api/v3/movie/lookup") return [{ title: "Dune", tmdbId: 603, year: 2021 }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "D:/Peliculas" }];
        if (req.path === "/api/v3/qualityprofile") return [{ id: 4, name: "HD" }];
        return [];
      },
    },
  });
  renderApp("/trackers");
  const section = await screen.findByRole("region", { name: "Freeleech y doble subida" });
  await userEvent.click(await within(section).findByRole("button", { name: "Enviar a qBittorrent: Matrix 1999" }));
  const dialog = await screen.findByRole("dialog", { name: "Añadir a Radarr y enviar" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(added).toHaveLength(0);
});
