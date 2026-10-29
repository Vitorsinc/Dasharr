import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { testFailure } from "@/api/prowlarr";

const indexers = [
  { id: 1, name: "Nyaa", enable: true, protocol: "torrent", privacy: "public", fields: [{ name: "baseUrl", value: "x" }] },
  { id: 2, name: "HDOlimpo", enable: true, protocol: "torrent", privacy: "private" },
  { id: 3, name: "Viejo", enable: false, protocol: "torrent" },
];

function backend() {
  const calls: any[] = [];
  mockBackend({
    api: {
      prowlarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v1/indexer") return indexers;
        if (req.path === "/api/v1/indexerstatus")
          return [{ indexerId: 2, disabledTill: "2099-01-01T10:00:00Z", mostRecentFailure: "2024-01-01T10:00:00Z" }];
        if (req.path === "/api/v1/health")
          return [{ source: "IndexerStatusCheck", type: "warning", message: "Indexers unavailable due to failures: HDOlimpo" }];
        if (req.path === "/api/v1/indexer/test") {
          if (req.body.value.id === 2)
            throw { kind: "Http", status: 400, message: '[{"propertyName":"","errorMessage":"Unable to connect to indexer"}]' };
          return {};
        }
        if (req.method === "PUT") return req.body.value;
        return {};
      },
    },
  });
  return calls;
}

test("testFailure saca los mensajes de validación de Prowlarr", () => {
  expect(testFailure({ kind: "Http", status: 400, message: '[{"errorMessage":"Bad \\"key\\""},{"errorMessage":"Bad \\"key\\""}]' })).toBe(
    'Bad "key"',
  );
  expect(testFailure({ kind: "Network" })).toBeUndefined();
});

test("indexadores: estado, avisos, probar todos y desactivar", async () => {
  const calls = backend();
  renderApp("/indexadores");
  expect(await screen.findByText("Nyaa")).toBeInTheDocument();
  expect(screen.getByText("2 de 3 activados")).toBeInTheDocument();
  expect(await screen.findByText(/En pausa hasta/)).toBeInTheDocument();
  expect(await screen.findByText("Indexers unavailable due to failures: HDOlimpo")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Probar todos" }));
  expect(await screen.findByText("Unable to connect to indexer")).toBeInTheDocument();
  const tested = calls.filter((c) => c.path === "/api/v1/indexer/test").map((c) => c.body.value.id);
  expect(tested.sort()).toEqual([1, 2]);
  // Se manda el indexador completo, con sus campos.
  expect(calls.find((c) => c.path === "/api/v1/indexer/test" && c.body.value.id === 1).body.value.fields).toEqual(indexers[0].fields);

  await userEvent.click(screen.getByRole("switch", { name: "Desactivar Nyaa" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  const put = calls.find((c) => c.method === "PUT");
  expect(put.path).toBe("/api/v1/indexer/1");
  expect(put.body.value).toMatchObject({ id: 1, enable: false, fields: indexers[0].fields });
});
