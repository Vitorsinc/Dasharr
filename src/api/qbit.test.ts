import { AddRejectedError, detectCompleted, planRemoval, qbit, sharedContent, torrentGroup, type Torrent } from "./qbit";
import { mockBackend } from "@/test/utils";

const tor = (hash: string, progress: number, state = "downloading") => ({ hash, progress, state }) as Torrent;

test("resume usa start y recurre a resume si da 404", async () => {
  const calls: string[] = [];
  mockBackend({
    api: {
      qbittorrent: (req) => {
        calls.push(req.path);
        if (req.path.endsWith("/start")) throw { kind: "Http", status: 404 };
        return null;
      },
    },
  });
  await qbit.resume(["a", "b"]);
  expect(calls).toEqual(["/api/v2/torrents/start", "/api/v2/torrents/resume"]);
});

test("pause no recurre si el error no es 404", async () => {
  mockBackend({ api: { qbittorrent: () => Promise.reject({ kind: "Unauthorized" }) } });
  await expect(qbit.pause(["a"])).rejects.toEqual({ kind: "Unauthorized" });
});

test("detectCompleted", () => {
  const prev = [tor("a", 0.5), tor("b", 1), tor("c", 0.9)];
  const next = [tor("a", 1), tor("b", 1), tor("c", 0.95), tor("d", 1)];
  expect(detectCompleted(prev, next).map((t) => t.hash)).toEqual(["a"]);
  expect(detectCompleted(undefined, next)).toEqual([]);
});

test("torrentGroup", () => {
  expect(torrentGroup(tor("a", 0.2, "stalledDL"))).toBe("downloading");
  expect(torrentGroup(tor("a", 1, "stalledUP"))).toBe("seeding");
  expect(torrentGroup(tor("a", 0.2, "stoppedDL"))).toBe("paused");
  expect(torrentGroup(tor("a", 1, "pausedUP"))).toBe("completed");
  expect(torrentGroup(tor("a", 0.2, "missingFiles"))).toBe("error");
});

test("torrents/add: detecta 'Fails.', failure_count y 409", async () => {
  let reply: unknown = "Ok.";
  mockBackend({
    api: {
      qbittorrent: () => {
        if (reply === 409) throw { kind: "Http", status: 409, message: "" };
        return reply;
      },
    },
  });
  await expect(qbit.addUrls(["magnet:?a"])).resolves.toBe("Ok.");
  reply = { success_count: 1, failure_count: 0, pending_count: 0 };
  await expect(qbit.addUrls(["magnet:?a"])).resolves.toBeTruthy();
  reply = "Fails.";
  await expect(qbit.addUrls(["magnet:?a"])).rejects.toBeInstanceOf(AddRejectedError);
  reply = { success_count: 0, failure_count: 1, pending_count: 0 };
  await expect(qbit.addUrls(["magnet:?a"])).rejects.toBeInstanceOf(AddRejectedError);
  reply = 409;
  await expect(qbit.addUrls(["magnet:?a"])).rejects.toBeInstanceOf(AddRejectedError);
});

const data = (hash: string, content_path: string, size = 10) => ({ hash, name: hash, size, content_path }) as Torrent;

test("sharedContent: misma ruta (cross-seed) o una dentro de la otra (episodio dentro del pack)", () => {
  const list = [
    data("a", "D:\\Descargas\\Dune.2021"),
    data("b", "D:/Descargas/Dune.2021/"),
    data("pack", "D:/Descargas/Show.S01"),
    data("ep", "D:/Descargas/Show.S01/Show.S01E01.mkv"),
    data("sib", "D:/Descargas/Show.S01.2"),
    data("solo", "D:/Descargas/Otra"),
  ];
  const shared = sharedContent(list);
  expect(shared.get("a")?.map((t) => t.hash)).toEqual(["b"]);
  expect(shared.get("pack")?.map((t) => t.hash)).toEqual(["ep"]);
  expect(shared.has("sib")).toBe(false);
  expect(shared.has("solo")).toBe(false);
});

test("planRemoval no borra archivos que usa otro torrent que se queda", () => {
  const list = [data("a", "/d/X"), data("b", "/d/X"), data("c", "/d/Y", 5)];
  expect(planRemoval(["a", "c"], list)).toEqual({ withFiles: ["c"], keepFiles: ["a"], freed: 5 });
  // Si se borran los dos que comparten, los archivos sí se van (y cuentan una vez).
  expect(planRemoval(["a", "b"], list)).toEqual({ withFiles: ["a", "b"], keepFiles: [], freed: 10 });
});

test("removeWithFiles quita sin archivos los que comparten con otro", async () => {
  const calls: string[] = [];
  mockBackend({
    api: {
      qbittorrent: (req) => {
        if (req.path === "/api/v2/torrents/info") return [data("a", "/d/X"), data("b", "/d/X"), data("c", "/d/Y")];
        calls.push(JSON.stringify(req.body.value));
        return null;
      },
    },
  });
  const plan = await qbit.removeWithFiles(["a", "c"]);
  expect(plan.keepFiles).toEqual(["a"]);
  expect(calls).toEqual([
    JSON.stringify([
      ["hashes", "a"],
      ["deleteFiles", "false"],
    ]),
    JSON.stringify([
      ["hashes", "c"],
      ["deleteFiles", "true"],
    ]),
  ]);
});
