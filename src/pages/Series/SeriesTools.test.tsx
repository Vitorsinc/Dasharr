import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const shogun = {
  id: 7,
  title: "Shōgun",
  year: 2024,
  tvdbId: 70,
  monitored: true,
  qualityProfileId: 1,
  path: "/tv/Shogun",
  rootFolderPath: "/tv",
  images: [],
  seasons: [{ seasonNumber: 1, monitored: true }],
  statistics: { episodeFileCount: 1, episodeCount: 2, totalEpisodeCount: 2, sizeOnDisk: 0 },
};
const frieren = { id: 9, title: "Frieren", year: 2023, tvdbId: 90, monitored: true, seriesType: "anime", images: [] };
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
    episodeFileId: 55,
  },
  {
    id: 102,
    seriesId: 7,
    seasonNumber: 1,
    episodeNumber: 2,
    title: "Servants",
    airDateUtc: "2024-02-27T00:00:00Z",
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
        if (req.path === "/api/v3/series" && req.method === "GET") return [shogun, frieren];
        if (req.path === "/api/v3/episode") return episodes;
        if (req.path === "/api/v3/episodefile")
          return [
            {
              id: 55,
              seriesId: 7,
              seasonNumber: 1,
              size: 2 * 1024 ** 3,
              relativePath: "S01E01.mkv",
              quality: { quality: { name: "HDTV-1080p" } },
            },
          ];
        if (req.path === "/api/v3/qualityprofile") return [{ id: 1, name: "HD" }];
        if (req.path === "/api/v3/rootfolder") return [{ id: 1, path: "/tv" }];
        if (req.path === "/api/v3/wanted/missing")
          return {
            records: [
              { ...episodes[1], series: shogun },
              { id: 901, seriesId: 9, seasonNumber: 1, episodeNumber: 5, title: "Mimic", hasFile: false, monitored: true, series: frieren },
            ],
          };
        if (req.path === "/api/v3/rename")
          return [
            { episodeFileId: 55, seasonNumber: 1, episodeNumbers: [1], existingPath: "S01E01.mkv", newPath: "Shogun - S01E01 - Anjin.mkv" },
          ];
        return {};
      },
    },
  });
  return calls;
}

const lastCommand = (calls: any[]) => calls.filter((c) => c.path === "/api/v3/command").at(-1)?.body.value;

test("buscadas de Series no incluye anime y buscar todos manda solo esos episodios", async () => {
  const calls = backend();
  renderApp("/series");
  await userEvent.click(await screen.findByRole("tab", { name: "Buscadas" }));
  expect(await screen.findByRole("button", { name: /^Shōgun · 1x02 · Servants/ })).toBeInTheDocument();
  expect(screen.queryByText(/Frieren/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Buscar todos" }));
  const confirm = await screen.findByRole("dialog", { name: "Buscar todos" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Buscar todos" }));
  await vi.waitFor(() => expect(lastCommand(calls)).toEqual({ name: "EpisodeSearch", episodeIds: [102] }));
});

test("ficha: temporada entera, archivo, actualizar, reescanear, renombrar y editar", async () => {
  const calls = backend();
  renderApp("/series");
  await userEvent.click(await screen.findByRole("button", { name: "Shōgun" }));
  const dialog = await screen.findByRole("dialog", { name: "Shōgun" });

  await userEvent.click(await within(dialog).findByRole("button", { name: /pulsa para dejar de monitorizar\): Temporada 1/ }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  expect(calls.find((c) => c.method === "PUT").body.value.seasons).toEqual([{ seasonNumber: 1, monitored: false }]);

  await userEvent.click(within(dialog).getByRole("button", { name: /Temporada 1/, expanded: false }));
  expect(await within(dialog).findByText(/HDTV-1080p/)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar archivo: 1x01" }));
  await userEvent.click(
    within(await screen.findByRole("dialog", { name: "Borrar archivo del episodio" })).getByRole("button", { name: "Borrar" }),
  );
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/episodefile/55"));

  await userEvent.click(within(dialog).getByRole("button", { name: "Actualizar" }));
  await vi.waitFor(() => expect(lastCommand(calls)).toEqual({ name: "RefreshSeries", seriesId: 7 }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Reescanear" }));
  await vi.waitFor(() => expect(lastCommand(calls)).toEqual({ name: "RescanSeries", seriesId: 7 }));

  await userEvent.click(within(dialog).getByRole("button", { name: "Renombrar" }));
  const rename = await screen.findByRole("dialog", { name: "Renombrar · Shōgun" });
  expect(await within(rename).findByText("Shogun - S01E01 - Anjin.mkv")).toBeInTheDocument();
  await userEvent.click(within(rename).getByRole("button", { name: "Renombrar 1" }));
  await vi.waitFor(() => expect(lastCommand(calls)).toEqual({ name: "RenameFiles", seriesId: 7, files: [55] }));

  await userEvent.click(within(dialog).getByRole("button", { name: "Editar" }));
  const edit = await screen.findByRole("dialog", { name: "Editar · Shōgun" });
  await userEvent.selectOptions(within(edit).getByLabelText("Monitorizar episodios"), "future");
  await userEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/v3/seasonpass")).toBeTruthy());
  expect(calls.find((c) => c.path === "/api/v3/seasonpass").body.value).toEqual({
    series: [{ id: 7, monitored: true }],
    monitoringOptions: { monitor: "future" },
  });
  const put = calls.filter((c) => c.method === "PUT").at(-1);
  expect(put.query).toContainEqual(["moveFiles", "false"]);
});
