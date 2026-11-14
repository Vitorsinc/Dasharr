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

test("filtra por tipo y manda a qBittorrent", async () => {
  const added: unknown[] = [];
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
    },
  });
  renderApp("/trackers");
  const section = await screen.findByRole("region", { name: "Freeleech y doble subida" });
  expect(await within(section).findByRole("listitem", { name: "Dune 2021" })).toHaveTextContent("×2 subida");
  await userEvent.click(within(section).getByRole("tab", { name: "Doble subida" }));
  expect(within(section).queryByRole("listitem", { name: "Matrix 1999" })).not.toBeInTheDocument();

  await userEvent.click(within(section).getByRole("button", { name: "Enviar a qBittorrent: Dune 2021" }));
  expect(await screen.findByText("Enviado a qBittorrent")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith("unit3d_fetch_torrent", { indexerId: 1, torrentId: 2 });
  expect(added).toHaveLength(1);
});
