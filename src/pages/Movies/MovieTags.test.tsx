import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

const movies = [
  { id: 1, title: "Dune", year: 2021, tmdbId: 10, hasFile: true, monitored: true, images: [], tags: [1] },
  { id: 2, title: "Arrival", year: 2016, tmdbId: 11, hasFile: false, monitored: true, images: [], tags: [] },
];

test("filtra la biblioteca por etiqueta y las cambia desde la ficha", async () => {
  const calls: any[] = [];
  mockBackend({
    api: {
      radarr: (req) => {
        calls.push(req);
        if (req.path === "/api/v3/movie" && req.method === "GET") return movies;
        if (req.path === "/api/v3/tag")
          return [
            { id: 1, label: "4k" },
            { id: 2, label: "kids" },
          ];
        if (req.method === "PUT") return req.body.value;
        return [];
      },
    },
  });
  renderApp("/peliculas");
  expect(await screen.findByRole("button", { name: "Arrival" })).toBeInTheDocument();
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Etiqueta" }), "1");
  expect(screen.queryByRole("button", { name: "Arrival" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dune" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Dune" }));
  const dialog = await screen.findByRole("dialog", { name: "Dune (2021)" });
  expect(within(dialog).getByRole("button", { name: "Etiqueta 4k" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(within(dialog).getByRole("button", { name: "Etiqueta kids" }));
  await vi.waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
  const put = calls.find((c) => c.method === "PUT");
  expect(put.path).toBe("/api/v3/movie/1");
  expect(put.body.value).toMatchObject({ id: 1, title: "Dune", tags: [1, 2] });
});
