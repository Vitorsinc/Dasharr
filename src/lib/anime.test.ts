import { defaultsFor, looksLikeAnime } from "./anime";

test("looksLikeAnime con los datos de la búsqueda de Sonarr", () => {
  expect(looksLikeAnime({ genres: ["Anime", "Action"] })).toBe(true);
  expect(looksLikeAnime({ genres: ["Animation"], originalLanguage: { id: 8, name: "Japanese" } })).toBe(true);
  expect(looksLikeAnime({ genres: ["Animation"], network: "Tokyo MX" })).toBe(true);
  expect(looksLikeAnime({ seriesType: "anime" })).toBe(true);
  // Animación occidental y series japonesas de imagen real no son anime.
  expect(looksLikeAnime({ genres: ["Animation", "Comedy"], network: "FOX", originalLanguage: { id: 1, name: "English" } })).toBe(false);
  expect(looksLikeAnime({ genres: ["Drama"], originalLanguage: { id: 8, name: "Japanese" } })).toBe(false);
  expect(looksLikeAnime({})).toBe(false);
});

test("defaultsFor elige la carpeta y el perfil de anime por nombre o lo guardado", () => {
  const roots = [
    { id: 1, path: "/media/anime" },
    { id: 2, path: "/media/tv" },
  ];
  const profiles = [
    { id: 1, name: "Anime 1080p" },
    { id: 2, name: "HD-1080p" },
  ];
  expect(defaultsFor("anime", roots, profiles)).toEqual({ rootFolderPath: "/media/anime", qualityProfileId: 1 });
  expect(defaultsFor("series", roots, profiles)).toEqual({ rootFolderPath: "/media/tv", qualityProfileId: 2 });
  expect(defaultsFor("series", roots, profiles, { rootFolderPath: "/media/anime", qualityProfileId: 9 })).toEqual({
    rootFolderPath: "/media/anime",
    qualityProfileId: 2,
  });
});
