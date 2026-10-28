import { sortReleases, type Release } from "./arr";

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
  expect(sortReleases(list, "default").map((x) => x.guid)).toEqual(["a", "b", "x"]);
});

test("sortReleases ordena por semillas y tamaño de mayor a menor", () => {
  const list = [r("a", { seeders: 1, size: 9 }), r("b", { seeders: 9, size: 1 })];
  expect(sortReleases(list, "seeders").map((x) => x.guid)).toEqual(["b", "a"]);
  expect(sortReleases(list, "size").map((x) => x.guid)).toEqual(["a", "b"]);
});
