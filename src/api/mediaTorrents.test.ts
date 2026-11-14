import { deleteWithTorrents } from "./mediaTorrents";
import { mockBackend } from "@/test/utils";

function backend(qbitDown = false) {
  const order: string[] = [];
  const removed: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        order.push(`radarr ${req.method} ${req.path}`);
        if (req.path === "/api/v3/history/movie") {
          const id = Number(new URLSearchParams(req.query).get("movieId"));
          return id === 1
            ? [{ downloadId: "AAA111" }, { downloadId: "AAA111" }, { downloadId: "SABnzbd_nzo_x" }, {}]
            : [{ downloadId: "BBB222" }];
        }
        return null;
      },
      qbittorrent: (req) => {
        if (qbitDown) throw { kind: "Network" };
        order.push(`qbit ${req.path}`);
        if (req.path === "/api/v2/torrents/info") return [{ hash: "aaa111" }, { hash: "bbb222" }, { hash: "ccc333" }];
        if (req.path === "/api/v2/torrents/delete") removed.push(Object.fromEntries(req.body.value));
        return null;
      },
    },
  });
  return { order, removed };
}

test("busca los torrents en el historial antes de borrar y los quita con sus archivos", async () => {
  const { order, removed } = backend();
  const del = vi.fn(async () => order.push("borrar"));
  const n = await deleteWithTorrents("radarr", [1, 2], { deleteFiles: true, addExclusion: false, deleteTorrents: true }, del);
  expect(n).toBe(2);
  expect(order.indexOf("borrar")).toBeGreaterThan(order.indexOf("qbit /api/v2/torrents/info"));
  expect(order.at(-1)).toBe("qbit /api/v2/torrents/delete");
  expect(removed).toEqual([{ hashes: "aaa111|bbb222", deleteFiles: "true" }]);
});

test("sin la casilla no toca qBittorrent", async () => {
  const { order } = backend();
  const del = vi.fn(async () => undefined);
  expect(await deleteWithTorrents("radarr", [1], { deleteFiles: false, addExclusion: false }, del)).toBe(0);
  expect(del).toHaveBeenCalled();
  expect(order).toEqual([]);
});

test("si qBittorrent no responde no se borra nada", async () => {
  backend(true);
  const del = vi.fn(async () => undefined);
  await expect(deleteWithTorrents("radarr", [1], { deleteFiles: true, addExclusion: false, deleteTorrents: true }, del)).rejects.toBeTruthy();
  expect(del).not.toHaveBeenCalled();
});
