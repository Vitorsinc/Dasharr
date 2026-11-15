import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { allConfigured, mockBackend, renderApp } from "@/test/utils";

const GB = 1024 ** 3;
const torrents = [
  {
    hash: "aaa",
    name: "Dune.2021.MULTi.2160p",
    size: 40 * GB,
    progress: 1,
    ratio: 0.8,
    added_on: 1_760_000_000,
    seeding_time: 30 * 86400,
    num_complete: 25,
    num_incomplete: 1,
    max_ratio: -1,
    max_seeding_time: -1,
    tracker: "https://t.one/announce",
  },
  {
    hash: "bbb",
    name: "Dune.2021.1080p.VOSE",
    size: 10 * GB,
    progress: 1,
    ratio: 0.2,
    added_on: 1_750_000_000,
    seeding_time: 3 * 86400,
    num_complete: 4,
    num_incomplete: 0,
    max_ratio: -1,
    max_seeding_time: 10080,
    tracker: "https://t.two/announce",
    content_path: "/d/Dune.VOSE",
  },
];
const movie = { id: 1, title: "Dune", year: 2021 };
const history = (eventType: string) =>
  eventType === "1"
    ? [
        {
          id: 1,
          eventType: "grabbed",
          date: "2026-02-01T00:00:00Z",
          sourceTitle: "x",
          downloadId: "AAA",
          movieId: 1,
          movie,
          data: { indexer: "Uno" },
        },
        {
          id: 2,
          eventType: "grabbed",
          date: "2025-12-01T00:00:00Z",
          sourceTitle: "y",
          downloadId: "BBB",
          movieId: 1,
          movie,
          data: { indexer: "Dos" },
        },
      ]
    : [
        {
          id: 3,
          eventType: "downloadFolderImported",
          date: "2026-02-01T01:00:00Z",
          sourceTitle: "x",
          downloadId: "AAA",
          movieId: 1,
          movie,
        },
        {
          id: 4,
          eventType: "downloadFolderImported",
          date: "2025-12-01T01:00:00Z",
          sourceTitle: "y",
          downloadId: "BBB",
          movieId: 1,
          movie,
        },
      ];

test("enseña el torrent sobrante y lo borra con sus archivos", async () => {
  const removed: string[] = [];
  mockBackend({
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/delete") {
          removed.push(JSON.stringify(req.body));
          return null;
        }
        return torrents;
      },
      radarr: (req) => {
        const records = history(Object.fromEntries(req.query).eventType);
        return { page: 1, pageSize: 1000, totalRecords: records.length, records };
      },
      sonarr: () => ({ page: 1, pageSize: 1000, totalRecords: 0, records: [] }),
    },
  });
  renderApp("/duplicados");
  const group = await screen.findByRole("region", { name: "Dune (2021)" });
  expect(group).toHaveTextContent("libera 10 GB");
  expect(group).toHaveTextContent("En uso");
  expect(group).toHaveTextContent("Sobrante");
  expect(group).toHaveTextContent("Dos");
  // 3 días sembrado de 7 que pide: faltan 4.
  expect(within(group).getByText("Faltan 4 d 0 h")).toBeInTheDocument();

  await userEvent.click(within(group).getByRole("button", { name: "Borrar Dune.2021.1080p.VOSE" }));
  expect(await screen.findByText(/podrías llevarte un H&R/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(removed).toHaveLength(1));
  expect(removed[0]).toContain("bbb");
  expect(removed[0]).toContain("true");
  expect(removed[0]).not.toContain("aaa");
});

test("sin Radarr ni Sonarr explica que hacen falta", async () => {
  const settings = allConfigured();
  settings.radarr.config.enabled = false;
  settings.sonarr.config.enabled = false;
  mockBackend({ settings, api: { qbittorrent: () => [] } });
  renderApp("/duplicados");
  expect(await screen.findByText(/Hace falta Radarr o Sonarr/)).toBeInTheDocument();
});

test("un torrent sin dueño que comparte archivos con el sobrante: solo se quita el torrent", async () => {
  const removed: string[] = [];
  const crossSeed = { ...torrents[1], hash: "ccc", name: "Dune.VOSE.otro.tracker", tracker: "https://t.three/announce" };
  mockBackend({
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/delete") {
          removed.push(JSON.stringify(req.body));
          return null;
        }
        return [...torrents, crossSeed];
      },
      radarr: (req) => {
        const records = history(Object.fromEntries(req.query).eventType);
        return { page: 1, pageSize: 1000, totalRecords: records.length, records };
      },
      sonarr: () => ({ page: 1, pageSize: 1000, totalRecords: 0, records: [] }),
    },
  });
  renderApp("/duplicados");
  const group = await screen.findByRole("region", { name: "Dune (2021)" });
  // Comparte los archivos con el de otro tracker: borrarlo no libera nada.
  expect(group).toHaveTextContent("libera 0 B");
  expect(within(group).getByText("Comparte archivos")).toBeInTheDocument();
  const orphans = screen.getByRole("region", { name: "Torrents sin dueño" });
  expect(orphans).toHaveTextContent("Dune.VOSE.otro.tracker");

  await userEvent.click(within(group).getByRole("button", { name: "Borrar Dune.2021.1080p.VOSE" }));
  expect(await screen.findByText(/no se libera espacio/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(removed).toHaveLength(1));
  expect(removed[0]).toContain("bbb");
  expect(removed[0]).toContain('["deleteFiles","false"]');
});

test("Inicio avisa de los sobrantes y lleva a Duplicados", async () => {
  mockBackend({
    api: {
      qbittorrent: () => torrents,
      radarr: (req) => {
        if (req.path !== "/api/v3/history") return [];
        const records = history(Object.fromEntries(req.query).eventType);
        return { page: 1, pageSize: 1000, totalRecords: records.length, records };
      },
      sonarr: (req) => (req.path === "/api/v3/history" ? { page: 1, pageSize: 1000, totalRecords: 0, records: [] } : []),
    },
  });
  renderApp("/");
  const notice = await screen.findByRole("link", { name: /Hay 1 torrent sobrante: liberarías 10 GB/ });
  await userEvent.click(notice);
  expect(await screen.findByRole("heading", { name: "Descargas duplicadas" })).toBeInTheDocument();
});

test("el seed mínimo sale del indexador de Prowlarr", async () => {
  mockBackend({
    api: {
      qbittorrent: () => torrents.map((x) => ({ ...x, max_ratio: -1, max_seeding_time: -1 })),
      radarr: (req) => {
        const records = history(Object.fromEntries(req.query).eventType);
        return { page: 1, pageSize: 1000, totalRecords: records.length, records };
      },
      sonarr: () => ({ page: 1, pageSize: 1000, totalRecords: 0, records: [] }),
      prowlarr: () => [
        { id: 2, name: "Dos", enable: true, protocol: "torrent", fields: [{ name: "torrentBaseSettings.seedTime", value: 5 * 1440 }] },
      ],
    },
  });
  renderApp("/duplicados");
  const group = await screen.findByRole("region", { name: "Dune (2021)" });
  // 3 días sembrado de los 5 que pide Prowlarr para «Dos».
  expect(await within(group).findByText("Faltan 2 d 0 h")).toBeInTheDocument();
  expect(within(group).getByText("Faltan 2 d 0 h")).toHaveAttribute("title", "Seed mínimo de Dos en Prowlarr: 5 d 0 h");
});

test("el seed mínimo se edita en el tracker y se guarda en Prowlarr en minutos", async () => {
  const puts: any[] = [];
  const fields = [
    { order: 1, name: "baseUrl", label: "Base Url", type: "textbox", value: "https://dos.org" },
    { order: 2, name: "torrentBaseSettings.seedRatio", label: "Seed Ratio", type: "number", value: null },
    { order: 3, name: "torrentBaseSettings.seedTime", label: "Seed Time", type: "number", value: 4320, advanced: true },
    { order: 4, name: "torrentBaseSettings.packSeedTime", label: "Pack Seed Time", type: "number", value: null, advanced: true },
  ];
  mockBackend({
    api: {
      prowlarr: (req) => {
        if (req.method === "PUT") {
          puts.push(req.body.value);
          return req.body.value;
        }
        if (req.path === "/api/v1/indexer") return [{ id: 2, name: "Dos", enable: true, protocol: "torrent", privacy: "private", fields }];
        return [];
      },
    },
  });
  renderApp("/indexadores");
  await userEvent.click(await screen.findByRole("button", { name: "Editar Dos" }));
  const days = await screen.findByRole("textbox", { name: "Tiempo sembrando" });
  expect(days).toHaveValue("72");
  // No se repiten en la lista general (Seed Time era avanzado; Seed Ratio no).
  expect(screen.queryByText("Seed Ratio")).not.toBeInTheDocument();
  await userEvent.clear(days);
  await userEvent.type(days, "7,5");
  await userEvent.type(screen.getByRole("textbox", { name: "Ratio" }), "1");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(puts).toHaveLength(1));
  const value = (n: string) => puts[0].fields.find((f: { name: string }) => f.name === n).value;
  expect(value("torrentBaseSettings.seedTime")).toBe(450);
  expect(value("torrentBaseSettings.seedRatio")).toBe(1);
  expect(value("torrentBaseSettings.packSeedTime")).toBeNull();
});
