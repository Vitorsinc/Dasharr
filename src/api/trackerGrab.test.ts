import { dealKind } from "./trackerGrab";

test("distingue películas de series", () => {
  expect(dealKind({ name: "Dune 2021 2160p", category: "Movies", tvdbId: null })).toBe("movie");
  expect(dealKind({ name: "Severance S02 2160p", category: "Movies", tvdbId: null })).toBe("series");
  expect(dealKind({ name: "Algo", category: "TV", tvdbId: null })).toBe("series");
  expect(dealKind({ name: "Algo", category: "Movies", tvdbId: 123 })).toBe("series");
});
