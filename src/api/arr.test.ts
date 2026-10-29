import { filterReleases, sortReleases, type Release } from "./arr";

const r = (guid: string, extra: Partial<Release>): Release => ({
  guid,
  title: guid,
  indexer: "i",
  indexerId: 1,
  size: 0,
  protocol: "torrent",
  ...extra,
});

test("sortReleases mantiene el orden del *arr y deja las rechazadas al final", () => {
  const list = [r("x", { rejected: true }), r("a", {}), r("b", {})];
  expect(sortReleases(list, { key: "default", dir: "asc" }).map((x) => x.guid)).toEqual(["a", "b", "x"]);
});

test("sortReleases ordena por semillas y tamaño de mayor a menor", () => {
  const list = [r("a", { seeders: 1, size: 9 }), r("b", { seeders: 9, size: 1 })];
  expect(sortReleases(list, { key: "seeders", dir: "desc" }).map((x) => x.guid)).toEqual(["b", "a"]);
  expect(sortReleases(list, { key: "size", dir: "desc" }).map((x) => x.guid)).toEqual(["a", "b"]);
});

test("sortReleases ordena en los dos sentidos por título, calidad y antigüedad", () => {
  const list = [
    { guid: "a", title: "B.720p", qualityWeight: 5, ageHours: 10 },
    { guid: "b", title: "a.2160p", qualityWeight: 20, ageHours: 1 },
    { guid: "c", title: "C.1080p", qualityWeight: 10, ageHours: 100 },
  ] as Release[];
  expect(sortReleases(list, { key: "title", dir: "asc" }).map((x) => x.guid)).toEqual(["b", "a", "c"]);
  expect(sortReleases(list, { key: "title", dir: "desc" }).map((x) => x.guid)).toEqual(["c", "a", "b"]);
  expect(sortReleases(list, { key: "quality", dir: "desc" }).map((x) => x.guid)).toEqual(["b", "c", "a"]);
  expect(sortReleases(list, { key: "age", dir: "asc" }).map((x) => x.guid)).toEqual(["b", "a", "c"]);
});

test("filterReleases exige todas las palabras y excluye las que llevan guion", () => {
  const list = [
    { guid: "a", title: "Dune.2021.1080p.x265.HDR", indexer: "IdxA" },
    { guid: "b", title: "Dune.2021.1080p.x264", indexer: "IdxB" },
    { guid: "c", title: "Dune.2021.2160p.x265", indexer: "IdxA" },
  ] as Release[];
  expect(filterReleases(list, "1080p").map((x) => x.guid)).toEqual(["a", "b"]);
  expect(filterReleases(list, "x265 -hdr").map((x) => x.guid)).toEqual(["c"]);
  expect(filterReleases(list, "idxb").map((x) => x.guid)).toEqual(["b"]);
  expect(filterReleases(list, "  ")).toHaveLength(3);
});
