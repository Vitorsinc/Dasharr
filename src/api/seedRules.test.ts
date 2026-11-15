import { baseDomain, ruleFor, seedRules } from "./seedRules";

const ix = (id: number, name: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  enable: true,
  protocol: "torrent" as const,
  fields: Object.entries(fields).map(([n, value]) => ({ name: n, type: "number", value })),
  ...extra,
});

test("baseDomain", () => {
  expect(baseDomain("https://tracker.hd-olimpo.club/announce/abc")).toBe("hd-olimpo.club");
  expect(baseDomain("hd-olimpo.club")).toBe("hd-olimpo.club");
  expect(baseDomain("https://www.example.co.uk/")).toBe("example.co.uk");
  expect(baseDomain(undefined)).toBeUndefined();
});

test("seedRules lee el seed mínimo de los indexadores de torrents y ruleFor los encuentra", () => {
  const rules = seedRules([
    ix(
      1,
      "HD-Olimpo",
      { "torrentBaseSettings.seedTime": 10080, "torrentBaseSettings.seedRatio": 1 },
      { indexerUrls: ["https://hd-olimpo.club/"] },
    ),
    ix(2, "Nyaa", { "torrentBaseSettings.seedTime": null }),
    { ...ix(3, "Usenet", { "torrentBaseSettings.seedTime": 60 }), protocol: "usenet" as const },
  ]);
  expect(rules).toEqual([{ indexer: "HD-Olimpo", domains: ["hd-olimpo.club"], ratio: 1, minutes: 10080, packMinutes: undefined }]);
  expect(ruleFor(rules, "HD-Olimpo (Prowlarr)", undefined)?.indexer).toBe("HD-Olimpo");
  expect(ruleFor(rules, undefined, "https://tracker.hd-olimpo.club/announce/x")?.indexer).toBe("HD-Olimpo");
  expect(ruleFor(rules, "Otro (Prowlarr)", "https://otro.org/a")).toBeUndefined();
});
