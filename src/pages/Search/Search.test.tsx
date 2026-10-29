import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { sortResults, type SearchResult } from "@/api/prowlarr";

const results = [
  {
    guid: "1",
    title: "Dune 2160p",
    indexer: "A",
    indexerId: 1,
    size: 50e9,
    seeders: 5,
    leechers: 1,
    publishDate: "2026-10-01T00:00:00Z",
    magnetUrl: "magnet:?xt=1",
    protocol: "torrent",
  },
  {
    guid: "2",
    title: "Dune 1080p",
    indexer: "B",
    indexerId: 2,
    size: 10e9,
    seeders: 300,
    leechers: 2,
    publishDate: "2026-09-01T00:00:00Z",
    downloadUrl: "http://prowlarr/dl/2",
    protocol: "torrent",
  },
  {
    guid: "3",
    title: "Dune NZB",
    indexer: "C",
    indexerId: 3,
    size: 20e9,
    publishDate: "2026-10-20T00:00:00Z",
    downloadUrl: "http://nzb",
    protocol: "usenet",
  },
] as SearchResult[];

test("sortResults", () => {
  expect(sortResults(results, "seeders").map((r) => r.guid)).toEqual(["2", "1", "3"]);
  expect(sortResults(results, "size").map((r) => r.guid)).toEqual(["1", "3", "2"]);
  expect(sortResults(results, "age").map((r) => r.guid)).toEqual(["3", "1", "2"]);
});

test("busca con categoría y envía a qBittorrent el magnet o el enlace", async () => {
  const prowlarrCalls: any[] = [];
  const qbitPosts: any[] = [];
  mockBackend({
    api: {
      prowlarr: (req) => {
        prowlarrCalls.push(req);
        return req.path === "/api/v1/indexer" ? [{ id: 1, name: "A", enable: true, protocol: "torrent" }] : results;
      },
      qbittorrent: (req) => {
        if (req.method === "POST") qbitPosts.push(req);
        return req.path === "/api/v2/torrents/categories" ? {} : [];
      },
    },
  });
  renderApp("/buscar");
  await userEvent.type(await screen.findByRole("textbox", { name: "¿Qué quieres buscar?" }), "dune");
  await userEvent.click(screen.getByRole("tab", { name: "Películas" }));
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("3 resultados")).toBeInTheDocument();
  const search = prowlarrCalls.find((c) => c.path === "/api/v1/search");
  expect(search.query).toContainEqual(["query", "dune"]);
  expect(search.query).toContainEqual(["categories", "2000"]);
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("Dune 1080p");
  await userEvent.click(screen.getByRole("button", { name: "Enviar a qBittorrent: Dune 2160p" }));
  expect(qbitPosts[0].body).toEqual({ type: "multipart", value: { fields: [["urls", "magnet:?xt=1"]], files: [] } });
  expect(screen.getByRole("button", { name: "Enviar a qBittorrent: Dune NZB" })).toBeDisabled();
});

test("sin magnet, Dasharr descarga el .torrent de Prowlarr y lo sube como archivo", async () => {
  const qbitPosts: any[] = [];
  const fetched: any[] = [];
  mockBackend({
    commands: {
      fetch_torrent: (args) => {
        fetched.push(args);
        return { type: "file", value: "ZDQ6dGVzdGU=" };
      },
    },
    api: {
      prowlarr: (req) => (req.path === "/api/v1/indexer" ? [] : results),
      qbittorrent: (req) => {
        if (req.method === "POST") qbitPosts.push(req);
        return req.path === "/api/v2/torrents/categories" ? {} : "Ok.";
      },
    },
  });
  renderApp("/buscar");
  await userEvent.type(await screen.findByRole("textbox", { name: "¿Qué quieres buscar?" }), "dune");
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await userEvent.click(await screen.findByRole("button", { name: "Enviar a qBittorrent: Dune 1080p" }));
  expect(fetched[0]).toEqual({ service: "prowlarr", url: "http://prowlarr/dl/2" });
  expect(qbitPosts[0].body.value.files).toEqual([{ field: "torrents", filename: "Dune 1080p.torrent", base64: "ZDQ6dGVzdGU=" }]);
});
