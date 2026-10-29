import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SubtitleBadge } from "./SubtitleBadge";

function renderBadge(title: string, infoUrl?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubtitleBadge title={title} infoUrl={infoUrl} />
    </QueryClientProvider>,
  );
}

test("muestra los idiomas del título sin consultar Nyaa si la release es de otro indexador", async () => {
  renderBadge("[Erai-raws] Frieren - 01 [1080p][Multiple Subtitle][ENG][SPA-LA]", "https://tracker.example/t/1");
  expect(screen.getByText("EN · ES-LA")).toBeInTheDocument();
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("nyaa_subtitles", expect.anything());
});

test("añade los idiomas de la página de Nyaa", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => (cmd === "nyaa_subtitles" ? ["es", "en", "pt-BR"] : undefined));
  renderBadge("[ToonsHub] Frieren S01E01 1080p (Multi-Subs)", "https://nyaa.si/view/123");
  expect(await screen.findByText("ES · EN · PT-BR")).toBeInTheDocument();
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("nyaa_subtitles", { url: "https://nyaa.si/view/123" });
});

test("avisa cuando ni el título ni Nyaa dicen nada", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => (cmd === "nyaa_subtitles" ? [] : undefined));
  renderBadge("[Shiniori-Raws] Frieren - 01 (1080p)", "https://nyaa.si/view/9");
  expect(await screen.findByText("Subs no indicados")).toBeInTheDocument();
});
