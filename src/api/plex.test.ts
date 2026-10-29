import { findInPlex, isWatched, newSessions, plexGuids, plexImage, plexTitle, plexWebUrl, type PlexIndex, type PlexItem } from "./plex";

const item = (p: Partial<PlexItem>): PlexItem => ({ ratingKey: "1", type: "movie", title: "X", ...p });

test("lee identificadores externos nuevos y de agentes antiguos", () => {
  expect(plexGuids(item({ Guid: [{ id: "tmdb://603" }, { id: "imdb://tt0133093" }] }))).toEqual(["tmdb://603", "imdb://tt0133093"]);
  expect(plexGuids(item({ guid: "com.plexapp.agents.thetvdb://81189?lang=es" }))).toEqual(["tvdb://81189"]);
  expect(plexGuids(item({ guid: "com.plexapp.agents.themoviedb://603?lang=es" }))).toEqual(["tmdb://603"]);
  expect(plexGuids(item({ guid: "plex://movie/5d776" }))).toEqual([]);
});

test("busca por TMDB, TVDB o IMDb sin confundir películas con series", () => {
  const movie = item({ ratingKey: "10", type: "movie" });
  const show = item({ ratingKey: "20", type: "show" });
  const index: PlexIndex = {
    byGuid: new Map([
      ["movie:tmdb://603", movie],
      ["show:tvdb://81189", show],
      ["show:tmdb://1396", show],
    ]),
    sections: [],
  };
  expect(findInPlex(index, { tmdbId: 603 }, "movie")).toBe(movie);
  expect(findInPlex(index, { tmdbId: 603 }, "show")).toBeUndefined();
  expect(findInPlex(index, { tvdbId: 1, tmdbId: 1396 }, "show")).toBe(show);
  expect(findInPlex(index, { imdbId: "tt1" }, "movie")).toBeUndefined();
});

test("visto: películas con reproducciones, series con todos los episodios", () => {
  expect(isWatched(item({ viewCount: 2 }))).toBe(true);
  expect(isWatched(item({}))).toBe(false);
  expect(isWatched(item({ type: "show", leafCount: 10, viewedLeafCount: 10 }))).toBe(true);
  expect(isWatched(item({ type: "show", leafCount: 10, viewedLeafCount: 3 }))).toBe(false);
});

test("títulos de episodios y temporadas", () => {
  expect(plexTitle(item({ type: "episode", title: "Piloto", grandparentTitle: "Breaking Bad", parentIndex: 1, index: 1 }))).toEqual({
    title: "Breaking Bad",
    subtitle: "T01E01 · Piloto",
  });
  expect(plexTitle(item({ type: "season", title: "Temporada 2", parentTitle: "Dark" }))).toEqual({ title: "Dark", subtitle: "Temporada 2" });
});

test("solo son nuevas las sesiones que no estaban antes, y nunca en la primera consulta", () => {
  const a = { ...item({}), Session: { id: "a" } };
  const b = { ...item({}), Session: { id: "b" } };
  expect(newSessions(undefined, [a])).toEqual([]);
  expect(newSessions([a], [a, b])).toEqual([b]);
});

test("enlaces a Plex Web y a carátulas", () => {
  expect(plexWebUrl("abc", "42")).toBe("https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F42");
  const img = plexImage("/library/metadata/5/thumb/17")!;
  expect(decodeURIComponent(img)).toContain("plex/photo/:/transcode?url=/library/metadata/5/thumb/17&width=300");
});
