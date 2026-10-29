import { hasSpanish, isNyaaPage, langLabel, mergeLanguages, titleSubtitles } from "./subtitles";

test("titleSubtitles lee las etiquetas típicas de Nyaa", () => {
  expect(titleSubtitles("[Erai-raws] Frieren - 01 [1080p][Multiple Subtitle][ENG][POR-BR][SPA-LA][SPA]")).toEqual({
    languages: ["en", "pt-BR", "es-419", "es"],
    multi: true,
  });
  expect(titleSubtitles("[Judas] Frieren - S01E01 [1080p][HEVC x265 10bit][Multi-Subs]")).toEqual({ languages: [], multi: true });
  expect(titleSubtitles("[Erai-raws] X - 01 [1080p CR WEB-DL AVC AAC][MultiSub][ABCD]").multi).toBe(true);
  expect(titleSubtitles("Frieren.S01E01.1080p.CR.WEB-DL.MULTi.SUBS").multi).toBe(true);
});

test("titleSubtitles conoce los grupos populares que no dicen sus subtítulos", () => {
  expect(titleSubtitles("[SubsPlease] Frieren - 01 (1080p) [ABCD].mkv")).toEqual({ languages: ["en"], multi: false });
  expect(titleSubtitles("[ASW] Dragon Ball Super - Beerus - 01 [1080p HEVC x265 10Bit][AAC]").languages).toEqual(["en"]);
  expect(titleSubtitles("[Sick-Fansubs] Dragon Ball Super - Beerus - 01 [1080p][0E526537].mp4").languages).toEqual(["el"]);
  // Lo que diga el título manda sobre lo que suele sacar el grupo.
  expect(titleSubtitles("[SubsPlease] Frieren - 01 [ESP]").languages).toEqual(["es"]);
  expect(titleSubtitles("[Erai-raws] Frieren - 01 [1080p]").languages).toEqual([]);
});

test("titleSubtitles reconoce el español escrito de muchas formas", () => {
  for (const t of [
    "[Fansub] Frieren - 01 [ESP]",
    "Frieren 01 [Spanish]",
    "Frieren 01 [Español]",
    "Frieren 01 Sub Español",
    "Frieren 01 [Sub Esp] [1080p]",
    "Frieren 01 VOSE 1080p",
    "Frieren - 01 (Castellano)",
    "[Fansub] Frieren - 01 [Spanish Subs]",
    "Frieren 01 [Subtitulado en Español]",
    "Frieren 01 [ENG+SPA]",
  ]) {
    expect(hasSpanish(titleSubtitles(t).languages)).toBe(true);
  }
  expect(titleSubtitles("Frieren 01 [ES-LA]").languages).toEqual(["es-419"]);
});

test("titleSubtitles no se confunde con doblajes ni palabras parecidas", () => {
  for (const t of ["Spa Day 01 1080p", "[Group] Espada 01", "Frieren S01E01 Dual Audio Spanish Dub", "Frieren 01 [Spanish Dub]", "Movie [DE Edition]"]) {
    expect(titleSubtitles(t).languages).toEqual([]);
  }
});

test("isNyaaPage solo acepta la página de un torrent", () => {
  expect(isNyaaPage("https://nyaa.si/view/1868340")).toBe(true);
  expect(isNyaaPage("https://nyaa.land/view/12/")).toBe(true);
  expect(isNyaaPage("https://nyaa.si/download/1868340.torrent")).toBe(false);
  expect(isNyaaPage("https://example.com/view/1")).toBe(false);
  expect(isNyaaPage(undefined)).toBe(false);
});

test("etiquetas y unión de idiomas", () => {
  expect(langLabel("es-419")).toBe("ES-LA");
  expect(langLabel("pt-BR")).toBe("PT-BR");
  expect(mergeLanguages(["es", "en"], ["en", "fr"])).toEqual(["es", "en", "fr"]);
});
