import { screen } from "@testing-library/react";
import { mockBackend, renderApp } from "@/test/utils";
import type { TrackerStats } from "@/api/trackers";

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
  mockBackend({ commands: { unit3d_stats: () => stats } });
  renderApp("/trackers");
  const card = await screen.findByRole("article", { name: "Aither (API)" });
  expect(card).toHaveTextContent("Power User");
  expect(card).toHaveTextContent("2,5");
  expect(card).toHaveTextContent("1,3 TB");
  expect(card).toHaveTextContent("-3 GB");
  expect(card).toHaveTextContent("312");
  expect(screen.getByText("Otro")).toBeInTheDocument();
  expect(screen.getByText("No disponible")).toBeInTheDocument();
});

test("avisa si Prowlarr no tiene trackers UNIT3D", async () => {
  mockBackend({ commands: { unit3d_stats: () => [] } });
  renderApp("/trackers");
  expect(await screen.findByText("Prowlarr no tiene ningún tracker UNIT3D con API key.")).toBeInTheDocument();
});
