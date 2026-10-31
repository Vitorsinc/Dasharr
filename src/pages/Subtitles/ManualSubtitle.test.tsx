import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      bazarr: (req) => {
        calls.push(req);
        if (req.path === "/api/movies/wanted")
          return { data: [{ title: "Dune", radarrId: 5, missing_subtitles: [{ name: "Spanish", code2: "es" }] }] };
        if (req.path === "/api/episodes/wanted") return { data: [] };
        if (req.path === "/api/providers/movies" && req.method === "GET")
          return {
            data: [
              {
                provider: "opensubtitles",
                subtitle: "A1",
                language: "es",
                forced: "False",
                hearing_impaired: "False",
                original_format: "False",
                score: 70,
                release_info: ["Dune.2021.WEB"],
              },
              {
                provider: "subdivx",
                subtitle: "B2",
                language: "es",
                forced: "False",
                hearing_impaired: "True",
                original_format: "False",
                score: 95,
                release_info: ["Dune.2021.BluRay"],
              },
            ],
          };
        if (req.path === "/api/movies/history")
          return {
            data: [
              {
                action: 1,
                title: "Dune",
                description: "Spanish subtitles downloaded from subdivx",
                parsed_timestamp: "29/10/26 20:00",
                language: { name: "Spanish", code2: "es" },
              },
            ],
          };
        return "";
      },
    },
  });
  return calls;
}

test("subtítulos: búsqueda manual elige un candidato y el historial muestra lo bajado", async () => {
  const calls = backend();
  renderApp("/subtitulos");
  await userEvent.click(await screen.findByRole("button", { name: "Manual: Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Subtítulos · Dune" });
  expect(await within(dialog).findByText("Dune.2021.BluRay")).toBeInTheDocument();
  // De más a menos puntuación.
  expect(within(dialog).getAllByRole("row")[1]).toHaveTextContent("subdivx");
  await userEvent.click(within(dialog).getByRole("button", { name: "Descargar: subdivx es 95" }));
  await vi.waitFor(() => expect(calls.find((c) => c.path === "/api/providers/movies" && c.method === "POST")).toBeTruthy());
  const post = calls.find((c) => c.path === "/api/providers/movies" && c.method === "POST");
  expect(Object.fromEntries(post.query)).toEqual({
    radarrid: "5",
    hi: "True",
    forced: "False",
    original_format: "False",
    provider: "subdivx",
    subtitle: "B2",
  });

  await userEvent.click(screen.getByRole("tab", { name: "Historial" }));
  expect(await screen.findByText("Spanish subtitles downloaded from subdivx")).toBeInTheDocument();
  expect(screen.getByText("Descargado")).toBeInTheDocument();
});
