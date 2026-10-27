import { detectCompleted, qbit, torrentGroup, type Torrent } from "./qbit";
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
