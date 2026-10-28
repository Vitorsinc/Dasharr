import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { episodeStatus } from "@/api/sonarr";

const series = [
  {
    id: 7,
    title: "Shōgun",
    year: 2024,
    tvdbId: 70,
    monitored: true,
    images: [],
    statistics: { episodeFileCount: 8, episodeCount: 10, totalEpisodeCount: 10, sizeOnDisk: 0 },
  },
  {
    id: 8,
    title: "Severance",
    year: 2022,
    tvdbId: 80,
    monitored: true,
    images: [],
    statistics: { episodeFileCount: 9, episodeCount: 9, totalEpisodeCount: 19, sizeOnDisk: 0 },
  },
];
const episodes = [
  {
    id: 101,
    seriesId: 7,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Anjin",
    airDateUtc: "2024-02-27T00:00:00Z",
    hasFile: true,
    monitored: true,
  },
  {
    id: 102,
    seriesId: 7,
    seasonNumber: 1,
    episodeNumber: 2,
    title: "Servants of Two Masters",
    airDateUtc: "2024-02-27T00:00:00Z",
    hasFile: false,
    monitored: true,
  },
  {
    id: 201,
    seriesId: 7,
    seasonNumber: 2,
    episodeNumber: 1,
    title: "TBA",
    airDateUtc: "2099-01-01T00:00:00Z",
    hasFile: false,
    monitored: true,
  },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      sonarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/series" && req.method === "GET") return series;
        if (req.path === "/api/v3/episode") return episodes;
        if (req.path === "/api/v3/qualityprofile") return [{ id: 1, name: "HD" }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "/tv" }];
        if (req.path === "/api/v3/languageprofile") throw { kind: "Http", status: 404 };
        if (req.path === "/api/v3/series/lookup") return [{ title: "The Bear", year: 2022, tvdbId: 99 }];
        if (req.path === "/api/v3/queue")
          return {
            records: [
              {
                id: 1,
                title: "Shogun.S01E02.1080p",
                size: 100,
                sizeleft: 0,
                status: "completed",
                trackedDownloadState: "importPending",
                trackedDownloadStatus: "warning",
                statusMessages: [{ title: "Shogun.S01E02.1080p", messages: ["No se reconoce la serie"] }],
                downloadId: "ABC",
              },
            ],
          };
        if (req.path === "/api/v3/manualimport")
          return [
            {
              id: 5,
              path: "/dl/Shogun.S01E02.mkv",
              relativePath: "Shogun.S01E02.mkv",
              size: 100,
              quality: { q: 1 },
              languages: [],
              downloadId: "ABC",
              rejections: [{ reason: "Serie desconocida" }],
            },
          ];
        return {};
      },
    },
  });
  return calls;
}

test("episodeStatus", () => {
  const now = new Date("2025-01-01");
  expect(episodeStatus({ hasFile: true, airDateUtc: "2099-01-01" }, now)).toBe("downloaded");
  expect(episodeStatus({ hasFile: false, airDateUtc: "2024-01-01" }, now)).toBe("missing");
  expect(episodeStatus({ hasFile: false, airDateUtc: "2026-01-01" }, now)).toBe("unaired");
  expect(episodeStatus({ hasFile: false }, now)).toBe("unaired");
});

test("filtra completas y abre la ficha con temporadas y búsqueda por temporada", async () => {
  const calls = backend();
  renderApp("/series");
  await userEvent.click(await screen.findByRole("tab", { name: "Completas" }));
  expect(screen.queryByRole("button", { name: "Shōgun" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Todas" }));
  await userEvent.click(screen.getByRole("button", { name: "Shōgun" }));
  const dialog = await screen.findByRole("dialog", { name: "Shōgun" });
  expect(await within(dialog).findByText("Temporada 1")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByText("Temporada 1"));
  expect(within(dialog).getByText("Falta")).toBeInTheDocument();
  expect(within(dialog).getByText("Descargado")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Buscar temporada 1" }));
  expect(calls.find((c) => c.path === "/api/v3/command")?.body.value).toEqual({ name: "SeasonSearch", seriesId: 7, seasonNumber: 1 });
});

test("añadir serie con opción de monitorización", async () => {
  const calls = backend();
  renderApp("/series");
  await userEvent.click(await screen.findByRole("button", { name: "Añadir serie" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByRole("textbox"), "bear");
  await userEvent.click(within(dialog).getByRole("button", { name: "Buscar" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: /The Bear/ }));
  await userEvent.selectOptions(within(dialog).getByLabelText("Monitorizar"), "future");
  await userEvent.click(within(dialog).getByRole("button", { name: "Añadir" }));
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v3/series");
  expect(post.body.value).toMatchObject({
    tvdbId: 99,
    qualityProfileId: 1,
    rootFolderPath: "/tv",
    addOptions: { monitor: "future", searchForMissingEpisodes: true },
  });
  expect(post.body.value.languageProfileId).toBeUndefined();
});

test("importación manual desde la cola asociando serie y episodio con hardlink", async () => {
  const calls = backend();
  renderApp("/series");
  await userEvent.click(await screen.findByRole("tab", { name: "Cola" }));
  expect(await screen.findByText("No se reconoce la serie")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Importar manualmente/ }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText("Serie desconocida")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/api/v3/manualimport").query).toEqual([
    ["downloadId", "ABC"],
    ["filterExistingFiles", "true"],
  ]);
  await userEvent.selectOptions(within(dialog).getByLabelText("Serie"), "7");
  await userEvent.selectOptions(await within(dialog).findByLabelText("Temporada"), "1");
  await userEvent.click(within(dialog).getByLabelText("Episodios 2"));
  await userEvent.click(within(dialog).getByLabelText(/Archivo Shogun/));
  await userEvent.click(within(dialog).getByRole("button", { name: "Importar 1" }));
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/v3/command");
  expect(post.body.value).toMatchObject({
    name: "ManualImport",
    importMode: "copy",
    files: [{ path: "/dl/Shogun.S01E02.mkv", seriesId: 7, seasonNumber: 1, episodeIds: [102], downloadId: "ABC", quality: { q: 1 } }],
  });
});
