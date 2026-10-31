import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { makeQueryClient } from "@/App";
import { PlexBadge } from "@/components/plex/PlexBadge";
import { mockBackend, renderApp, type ApiHandlers } from "@/test/utils";

const session = {
  ratingKey: "7",
  type: "episode",
  title: "Piloto",
  grandparentTitle: "Breaking Bad",
  grandparentThumb: "/library/metadata/1/thumb/2",
  parentIndex: 1,
  index: 1,
  duration: 1000,
  viewOffset: 500,
  User: { id: "3", title: "Ana", thumb: "https://plex.tv/users/ana/avatar" },
  Player: { title: "Salón", state: "playing" },
  Session: { id: "s1", bandwidth: 8000, location: "wan" },
  TranscodeSession: { videoDecision: "transcode" },
};

function plexApi(calls: { method: string; path: string; query: [string, string][] }[]): ApiHandlers["plex"] {
  return (r) => {
    calls.push(r);
    switch (r.path) {
      case "/":
        return { MediaContainer: { friendlyName: "Casa", version: "1.41.2.9200-abc", machineIdentifier: "m1" } };
      case "/status/sessions":
        return { MediaContainer: { Metadata: [session] } };
      case "/library/sections":
        return { MediaContainer: { Directory: [{ key: "1", title: "Cine", type: "movie" }, { key: "2", title: "Series", type: "show", refreshing: true }] } };
      case "/library/sections/1/all":
        return { MediaContainer: { Metadata: [{ ratingKey: "55", type: "movie", title: "Matrix", viewCount: 1, Guid: [{ id: "tmdb://603" }] }] } };
      case "/library/sections/2/all":
        return { MediaContainer: { Metadata: [] } };
      case "/library/recentlyAdded":
        return { MediaContainer: { Metadata: [{ ratingKey: "9", type: "movie", title: "Dune", year: 2021, thumb: "/t" }] } };
      case "/updater/status":
        return { MediaContainer: { Release: [{ version: "1.42.0.1-x" }] } };
      case "/statistics/resources":
        return { MediaContainer: { StatisticsResources: [{ hostCpuUtilization: 12.5, hostMemoryUtilization: 40 }] } };
      case "/activities":
        return { MediaContainer: { Activity: [{ uuid: "u", type: "library.update.section", title: "Escaneando Series", progress: 30 }] } };
    }
    return null;
  };
}

test("página de Plex: quién ve qué, detener, servidor, bibliotecas y mantenimiento", async () => {
  const calls: { method: string; path: string; query: [string, string][] }[] = [];
  mockBackend({ api: { plex: plexApi(calls) } });
  renderApp("/plex");

  expect(await screen.findByText("Breaking Bad")).toBeInTheDocument();
  expect(screen.getByText("T01E01 · Piloto")).toBeInTheDocument();
  expect(screen.getByText("Ana")).toBeInTheDocument();
  expect(document.querySelector('img[src="https://plex.tv/users/ana/avatar"]')).toBeInTheDocument();
  expect(screen.getByText("Convirtiendo")).toBeInTheDocument();
  expect(screen.getByText("Fuera de casa")).toBeInTheDocument();

  expect(await screen.findByText("Actualización disponible: 1.42.0.1")).toBeInTheDocument();
  expect(screen.getByText("Escaneando Series")).toBeInTheDocument();
  expect(await screen.findByText("Escaneando…")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Detener Breaking Bad" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.clear(within(dialog).getByRole("textbox"));
  await userEvent.type(within(dialog).getByRole("textbox"), "A dormir");
  await userEvent.click(within(dialog).getByRole("button", { name: "Detener" }));
  const stop = calls.find((c) => c.path === "/status/sessions/terminate");
  expect(stop?.query).toEqual([
    ["sessionId", "s1"],
    ["reason", "A dormir"],
  ]);

  const movies = screen.getByText("Cine").closest("div")!;
  await userEvent.click(within(movies).getByRole("button", { name: /Escanear/ }));
  expect(calls.some((c) => c.path === "/library/sections/1/refresh")).toBe(true);

  await userEvent.click(screen.getByRole("button", { name: "Optimizar base de datos" }));
  await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar" }));
  expect(calls.some((c) => c.method === "PUT" && c.path === "/library/optimize")).toBe(true);
});

test("Inicio muestra lo que se reproduce y lo añadido a Plex", async () => {
  mockBackend({ api: { plex: plexApi([]) } });
  renderApp("/");
  expect(await screen.findByText("Reproduciendo ahora")).toBeInTheDocument();
  expect(await screen.findByText("Breaking Bad")).toBeInTheDocument();
  expect(await screen.findByText("Añadido recientemente a Plex")).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Dune" }));
  expect(openUrl).toHaveBeenCalledWith("https://app.plex.tv/desktop/#!/server/m1/details?key=%2Flibrary%2Fmetadata%2F9");
});

test("ficha: en Plex, visto, y marcar como no visto", async () => {
  const calls: { method: string; path: string; query: [string, string][] }[] = [];
  mockBackend({ api: { plex: plexApi(calls) } });
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <PlexBadge kind="movie" ids={{ tmdbId: 603 }} />
      <PlexBadge kind="show" ids={{ tvdbId: 1 }} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("En Plex")).toBeInTheDocument();
  expect(screen.getByText("Visto")).toBeInTheDocument();
  expect(screen.getByText("No está en Plex")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Marcar como no visto" }));
  expect(calls.find((c) => c.path === "/:/unscrobble")?.query).toContainEqual(["key", "55"]);
  await userEvent.click(screen.getByRole("button", { name: "Escanear biblioteca" }));
  expect(calls.some((c) => c.path === "/library/sections/2/refresh")).toBe(true);
});

test("Ajustes: iniciar sesión con Plex y elegir el servidor", async () => {
  const finish = vi.fn();
  let checks = 0;
  mockBackend({
    commands: {
      plex_login_start: () => ({ pinId: 7, url: "https://app.plex.tv/auth#?code=x" }),
      plex_login_check: () => (++checks < 2 ? null : [{ id: "srv", name: "Casa", owned: true, localUrl: "http://10.0.0.2:32400", externalUrl: "https://x.plex.direct:32400" }]),
      plex_login_finish: (args) => finish(args),
    },
  });
  renderApp("/ajustes/servicios/plex");
  const form = await screen.findByRole("region", { name: "Plex" });
  await userEvent.click(within(form).getByRole("button", { name: "Iniciar sesión con Plex" }));
  expect(openUrl).toHaveBeenCalledWith("https://app.plex.tv/auth#?code=x");
  await userEvent.click(await within(form).findByRole("button", { name: "Usar este servidor" }, { timeout: 6000 }));
  expect(finish).toHaveBeenCalledWith({
    serverId: "srv",
    config: { localUrl: "http://h:32400", externalUrl: "https://x.plex.direct:32400", enabled: true },
  });
}, 10_000);
