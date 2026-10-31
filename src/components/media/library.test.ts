import { filterSort, type LibItem } from "./library";

const items: (LibItem & { id: number })[] = [
  { id: 1, title: "Zodiac", year: 2007, added: "2024-01-01", monitored: true, downloaded: true, missing: false },
  { id: 2, title: "Ámbar", year: 2020, added: "2025-05-01", monitored: true, downloaded: false, missing: true },
  { id: 3, title: "Babel", year: 2006, added: "2023-01-01", monitored: false, downloaded: false, missing: false },
];
const ids = (r: { id: number }[]) => r.map((i) => i.id);

test("filtros", () => {
  expect(ids(filterSort(items, { query: "", filter: "downloaded", sort: "title" }))).toEqual([1]);
  expect(ids(filterSort(items, { query: "", filter: "missing", sort: "title" }))).toEqual([2]);
  expect(ids(filterSort(items, { query: "", filter: "monitored", sort: "title" }))).toEqual([2, 1]);
});

test("orden y búsqueda sin acentos", () => {
  expect(ids(filterSort(items, { query: "", filter: "all", sort: "title" }))).toEqual([2, 3, 1]);
  expect(ids(filterSort(items, { query: "", filter: "all", sort: "added" }))).toEqual([2, 1, 3]);
  expect(ids(filterSort(items, { query: "", filter: "all", sort: "year" }))).toEqual([2, 1, 3]);
  expect(ids(filterSort(items, { query: "ambar", filter: "all", sort: "title" }))).toEqual([2]);
});

test("ordenar por nota: de mayor a menor y sin nota al final", () => {
  const rated = [
    { ...items[0], scores: { imdb: 7.7 } },
    { ...items[1], scores: { imdb: 8.1, filmaffinity: 6 } },
    { ...items[2] },
  ];
  expect(ids(filterSort(rated, { query: "", filter: "all", sort: "rating:imdb" }))).toEqual([2, 1, 3]);
  expect(ids(filterSort(rated, { query: "", filter: "all", sort: "rating:filmaffinity" }))).toEqual([2, 3, 1]);
});

test("filtro por etiqueta", () => {
  const tagged = items.map((i) => ({ ...i, tags: i.id === 3 ? [9] : i.id === 1 ? [9, 4] : [] }));
  expect(ids(filterSort(tagged, { query: "", filter: "all", sort: "title", tag: 9 }))).toEqual([3, 1]);
  expect(ids(filterSort(tagged, { query: "", filter: "all", sort: "title", tag: null }))).toEqual([2, 3, 1]);
});
