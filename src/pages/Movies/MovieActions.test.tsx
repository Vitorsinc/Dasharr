import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { setPrefs } from "@/hooks/usePrefs";

const dune = {
  id: 1,
  title: "Dune",
  year: 2021,
  tmdbId: 10,
  hasFile: true,
  monitored: true,
  images: [],
  movieFile: { id: 55, relativePath: "dune.mkv", quality: { quality: { name: "Bluray-1080p" } } },
};

function backend(rename: unknown[] = []) {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return [dune];
        if (req.path === "/api/v3/rename") return rename;
        return [];
      },
    },
  });
  return calls;
}

async function openDune() {
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  return screen.findByRole("dialog", { name: "Dune (2021)" });
}

const commands = (calls: any[]) => calls.filter((c) => c.path === "/api/v3/command").map((c) => c.body.value);

test("ficha de película: actualizar, reescanear y borrar el archivo con confirmación", async () => {
  const calls = backend();
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Actualizar" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Reescanear" }));
  await vi.waitFor(() =>
    expect(commands(calls)).toEqual([
      { name: "RefreshMovie", movieIds: [1] },
      { name: "RescanMovie", movieId: 1 },
    ]),
  );

  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar archivo" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar archivo de la película" });
  expect(calls.find((c) => c.path.startsWith("/api/v3/moviefile"))).toBeUndefined();
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/v3/moviefile/55"));
});

test("ficha de película: renombrar con vista previa", async () => {
  const calls = backend([{ movieId: 1, movieFileId: 55, existingPath: "Dune/dune.mkv", newPath: "Dune (2021)/Dune (2021) Bluray-1080p.mkv" }]);
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Renombrar" }));
  const preview = await screen.findByRole("dialog", { name: "Renombrar · Dune" });
  expect(await within(preview).findByText("Dune (2021)/Dune (2021) Bluray-1080p.mkv")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/api/v3/rename").query).toEqual([["movieId", "1"]]);
  await userEvent.click(within(preview).getByRole("button", { name: "Renombrar 1" }));
  await vi.waitFor(() => expect(commands(calls)).toEqual([{ name: "RenameMovie", movieIds: [1] }]));
});

test("ficha de película: sin nada que renombrar lo dice", async () => {
  backend([]);
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Renombrar" }));
  const preview = await screen.findByRole("dialog", { name: "Renombrar · Dune" });
  expect(await within(preview).findByText("Todos los archivos ya tienen el nombre correcto.")).toBeInTheDocument();
});

test("borrar película: también quita su torrent de qBittorrent si se marca", async () => {
  const removed: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        if (req.path === "/api/v3/movie" && req.method === "GET") return [dune];
        if (req.path === "/api/v3/history/movie") return [{ id: 1, eventType: "grabbed", date: "2026-01-01", sourceTitle: "Dune", downloadId: "ABC" }];
        return [];
      },
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/info")
          return [
            {
              hash: "abc",
              name: "Dune.2021.1080p",
              size: 8 * 1024 ** 3,
              progress: 1,
              state: "uploading",
              tracker: "https://tracker.ejemplo.org/announce/PASSKEY",
              seeding_time: 3 * 86400 + 2 * 3600,
              ratio: 1.5,
              num_seeds: 3,
              num_complete: 40,
              num_leechs: 1,
              num_incomplete: 2,
            },
            { hash: "otro" },
          ];
        if (req.path === "/api/v2/torrents/delete") removed.push(Object.fromEntries(req.body.value));
        return [];
      },
    },
  });
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar película" });
  expect(await within(confirm).findByText("Dune.2021.1080p")).toBeInTheDocument();
  expect(within(confirm).getByText("tracker.ejemplo.org")).toBeInTheDocument();
  expect(within(confirm).queryByText(/PASSKEY/)).toBeNull();
  expect(within(confirm).getByText("3 d 2 h")).toBeInTheDocument();
  expect(within(confirm).getByText("1,50")).toBeInTheDocument();
  expect(within(confirm).getByText("3/40")).toBeInTheDocument();
  expect(within(confirm).getByRole("checkbox", { name: "Dune.2021.1080p" })).toBeEnabled();
  await userEvent.click(within(confirm).getByRole("checkbox", { name: /Quitar todos sus torrents/ }));
  expect(within(confirm).getByRole("checkbox", { name: "Dune.2021.1080p" })).toBeDisabled();
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(removed).toEqual([{ hashes: "abc", deleteFiles: "true" }]));
  expect(await screen.findByText("Quitado 1 torrent de qBittorrent")).toBeInTheDocument();
});

test("borrar película: sin «quitar todos» se eligen los torrents uno a uno", async () => {
  setPrefs({ deleteTorrents: false });
  const removed: any[] = [];
  const tor = (hash: string, name: string) => ({ hash, name, size: 1, progress: 1, state: "uploading", ratio: 1, num_seeds: 0, num_leechs: 0 });
  mockBackend({
    api: {
      radarr: (req) => {
        if (req.path === "/api/v3/movie" && req.method === "GET") return [dune];
        if (req.path === "/api/v3/history/movie") return [{ downloadId: "A" }, { downloadId: "B" }];
        return [];
      },
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/info") return [tor("a", "Dune.2160p"), tor("b", "Dune.1080p")];
        if (req.path === "/api/v2/torrents/delete") removed.push(Object.fromEntries(req.body.value));
        return [];
      },
    },
  });
  const dialog = await openDune();
  await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
  const confirm = await screen.findByRole("dialog", { name: "Borrar película" });
  await userEvent.click(await within(confirm).findByRole("checkbox", { name: "Dune.1080p" }));
  await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
  await vi.waitFor(() => expect(removed).toEqual([{ hashes: "b", deleteFiles: "true" }]));
});
