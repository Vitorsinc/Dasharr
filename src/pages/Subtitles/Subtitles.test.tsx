import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

test("lista lo que falta y lanza la búsqueda por idioma", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      bazarr: (req) => {
        calls.push(req);
        if (req.path === "/api/movies/wanted") return { data: [{ title: "Dune", radarrId: 5, missing_subtitles: [{ name: "Spanish", code2: "es", forced: false, hi: false }, { name: "English", code2: "en", forced: true, hi: false }] }] };
        if (req.path === "/api/episodes/wanted") return { data: [{ seriesTitle: "Shōgun", episode_number: "1x02", episodeTitle: "Servants", sonarrSeriesId: 7, sonarrEpisodeId: 102, missing_subtitles: [{ name: "Spanish", code2: "es" }] }] };
        return null;
      },
    },
  });
  renderApp("/subtitulos");
  expect(await screen.findByText("Dune")).toBeInTheDocument();
  expect(screen.getByText("English (forzados)")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Buscar: Dune" }));
  const patches = calls.filter((c) => c.method === "PATCH");
  expect(patches.map((p) => p.path)).toEqual(["/api/movies/subtitles", "/api/movies/subtitles"]);
  expect(patches[1].query).toEqual([["radarrid", "5"], ["language", "en"], ["forced", "true"], ["hi", "false"]]);

  await userEvent.click(screen.getByRole("tab", { name: /Episodios/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Buscar: Shōgun 1x02 · Servants" }));
  expect(calls.filter((c) => c.method === "PATCH").at(-1)).toMatchObject({ path: "/api/episodes/subtitles", query: [["seriesid", "7"], ["episodeid", "102"], ["language", "es"], ["forced", "false"], ["hi", "false"]] });

  await userEvent.click(screen.getByRole("button", { name: "Buscar todos" }));
  expect(calls.filter((c) => c.path === "/api/system/tasks").map((c) => c.query[0][1])).toEqual(["wanted_search_missing_subtitles_movies", "wanted_search_missing_subtitles_series"]);
});
