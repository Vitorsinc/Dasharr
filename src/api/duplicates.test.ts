import type { HistoryRecord } from "./arr";
import type { Torrent } from "./qbit";
import { arrDownloadHistory, findDuplicates, seedGoal, trackerHost } from "./duplicates";
import { mockBackend } from "@/test/utils";

const tor = (hash: string, extra: Partial<Torrent> = {}) =>
  ({ hash, name: hash, size: 1e9, progress: 1, ratio: 1, added_on: 1_700_000_000, seeding_time: 3600, ...extra }) as Torrent;

const movie = { id: 1, title: "Dune", year: 2021 };
const rec = (eventType: string, hash: string, date: string, extra: Partial<HistoryRecord> = {}): HistoryRecord => ({
  id: Math.random(),
  eventType,
  date,
  sourceTitle: hash,
  downloadId: hash.toUpperCase(),
  movieId: 1,
  movie,
  ...extra,
});

test("película: la última importación está en uso y la anterior sobra", () => {
  const groups = findDuplicates(
    [tor("old", { size: 5e9 }), tor("new"), tor("other")],
    [
      {
        service: "radarr",
        records: [
          rec("grabbed", "old", "2026-01-01T00:00:00Z", { data: { indexer: "Tracker A" }, quality: { quality: { name: "WEBDL-1080p" } } }),
          rec("downloadFolderImported", "old", "2026-01-01T01:00:00Z"),
          rec("grabbed", "new", "2026-02-01T00:00:00Z", { data: { indexer: "Tracker B" } }),
          rec("downloadFolderImported", "new", "2026-02-01T01:00:00Z"),
          rec("grabbed", "other", "2026-02-01T00:00:00Z", { movieId: 2, movie: { id: 2, title: "Otra" } }),
        ],
      },
    ],
  );
  expect(groups).toHaveLength(1);
  const [g] = groups;
  expect(g.title).toBe("Dune (2021)");
  expect(g.leftoverSize).toBe(5e9);
  expect(g.items.map((i) => [i.torrent.hash, i.role])).toEqual([
    ["new", "current"],
    ["old", "leftover"],
  ]);
  expect(g.items[1]).toMatchObject({ indexer: "Tracker A", quality: "WEBDL-1080p" });
});

test("una mejora que aún no se ha importado no deja nada como sobrante", () => {
  const groups = findDuplicates(
    [tor("a"), tor("b", { progress: 0.4 })],
    [
      {
        service: "radarr",
        records: [
          rec("grabbed", "a", "2026-01-01T00:00:00Z"),
          rec("downloadFolderImported", "a", "2026-01-01T01:00:00Z"),
          rec("grabbed", "b", "2026-02-01T00:00:00Z"),
        ],
      },
    ],
  );
  expect(groups).toEqual([]);
});

test("serie: un pack de temporada solo sobra si todos sus episodios se reemplazaron", () => {
  const ep = (episodeId: number, n: number) => ({
    episodeId,
    seriesId: 7,
    series: { id: 7, title: "Severance" },
    episode: { seasonNumber: 1, episodeNumber: n, title: "" },
  });
  const sonarr = (eventType: string, hash: string, date: string, id: number, n: number) =>
    ({ ...rec(eventType, hash, date), movieId: undefined, movie: undefined, ...ep(id, n) }) as HistoryRecord;
  const records = [
    sonarr("downloadFolderImported", "pack", "2026-01-01T00:00:00Z", 11, 1),
    sonarr("downloadFolderImported", "pack", "2026-01-01T00:00:00Z", 12, 2),
    sonarr("downloadFolderImported", "e1", "2026-02-01T00:00:00Z", 11, 1),
  ];
  expect(findDuplicates([tor("pack"), tor("e1")], [{ service: "sonarr", records }])).toEqual([]);

  records.push(sonarr("downloadFolderImported", "e2", "2026-02-02T00:00:00Z", 12, 2));
  const [g] = findDuplicates([tor("pack"), tor("e1"), tor("e2")], [{ service: "sonarr", records }]);
  expect(g.title).toBe("Severance");
  const pack = g.items.find((i) => i.torrent.hash === "pack")!;
  expect(pack.role).toBe("leftover");
  expect(pack.episodes).toBe("1x01–1x02");
  expect(g.items.filter((i) => i.role === "current")).toHaveLength(2);
});

test("objetivo de siembra: ratio o tiempo, lo primero que llegue", () => {
  expect(seedGoal(tor("x", { max_ratio: -1, max_seeding_time: -1 }))).toBeUndefined();
  expect(seedGoal(tor("x", { max_ratio: 2, max_seeding_time: 120, ratio: 0.5, seeding_time: 3600 }))).toEqual({
    met: false,
    ratio: 2,
    minutes: 120,
    remainingSecs: 3600,
  });
  expect(seedGoal(tor("x", { max_ratio: 1, max_seeding_time: 120, ratio: 1.2, seeding_time: 60 }))?.met).toBe(true);
});

test("trackerHost", () => {
  expect(trackerHost("https://tracker.example.org:443/announce/abc")).toBe("example.org");
  expect(trackerHost("")).toBeUndefined();
});

test("el historial se pide por páginas y para al llegar a torrents más antiguos", async () => {
  const pages: string[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        const q = Object.fromEntries(req.query);
        pages.push(`${q.eventType}:${q.page}`);
        const date = q.page === "1" ? "2030-01-01T00:00:00Z" : "2000-01-01T00:00:00Z";
        return { page: Number(q.page), pageSize: 1000, totalRecords: 5000, records: Array.from({ length: 1000 }, () => ({ date })) };
      },
    },
  });
  const records = await arrDownloadHistory("radarr", [tor("a", { added_on: Date.parse("2026-01-01") / 1000 })]);
  expect(records).toHaveLength(4000);
  expect(pages.sort()).toEqual(["1:1", "1:2", "3:1", "3:2"]);
});
