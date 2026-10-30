import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setPrefs } from "@/hooks/usePrefs";
import { mockBackend, renderApp } from "@/test/utils";

const iso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

const movies = [
  {
    id: 1,
    title: "Ya estrenada",
    year: 2020,
    tmdbId: 10,
    hasFile: true,
    monitored: true,
    status: "released",
    inCinemas: "2020-01-01T00:00:00Z",
  },
  {
    id: 2,
    title: "Lejana",
    year: 2027,
    tmdbId: 11,
    hasFile: false,
    monitored: true,
    status: "announced",
    inCinemas: `${iso(200)}T00:00:00Z`,
  },
  {
    id: 3,
    title: "Cercana",
    year: 2026,
    tmdbId: 12,
    hasFile: false,
    monitored: true,
    status: "inCinemas",
    inCinemas: `${iso(-10)}T00:00:00Z`,
    digitalRelease: `${iso(30)}T00:00:00Z`,
  },
];

function backend(withKey: boolean) {
  const asked: any[] = [];
  mockBackend({
    api: { radarr: (req) => (req.path === "/api/v3/movie" ? movies : []) },
    commands: {
      tmdb_has_key: () => withKey,
      tmdb_release_dates: (args) => {
        asked.push(args);
        // En España llega a los cines más tarde que en Radarr.
        return { 12: { cinema: iso(5), digital: null } };
      },
    },
  });
  return asked;
}

afterEach(() => setPrefs({ releaseCountry: "ES" }));

test("Próximos: sin clave de TMDB, ordena por el estreno más cercano con las fechas de Radarr", async () => {
  backend(false);
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("tab", { name: "Próximos" }));
  const rows = await screen.findAllByRole("button", { name: /\(20\d\d\)/ });
  expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Cercana"), expect.stringContaining("Lejana")]);
  expect(within(rows[0]).getByText(/^Digital ·/)).toBeInTheDocument();
  expect(within(rows[0]).queryByText(/^En cines/)).not.toBeInTheDocument();
  expect(screen.getByText(/añade una clave de TMDB/)).toBeInTheDocument();
});

test("Próximos: con clave de TMDB usa las fechas del país elegido", async () => {
  setPrefs({ releaseCountry: "MX" });
  const asked = backend(true);
  renderApp("/peliculas");
  await userEvent.click(await screen.findByRole("tab", { name: "Próximos" }));
  const row = await screen.findByRole("button", { name: /Cercana/ });
  expect(await within(row).findByText(/^En cines ·/)).toBeInTheDocument();
  expect(within(row).getByText(/^Digital ·/)).toBeInTheDocument();
  expect(asked[0]).toEqual({ ids: [11, 12], country: "MX" });
  expect(screen.getByText(/Fechas de México según TMDB/)).toBeInTheDocument();
});

test("Ajustes: elige el país y guarda la clave de TMDB", async () => {
  const saved: string[] = [];
  mockBackend({
    commands: {
      tmdb_has_key: () => saved.length > 0,
      tmdb_save_key: ({ key }) => {
        saved.push(key);
      },
    },
  });
  renderApp("/ajustes/contenido");
  const section = await screen.findByRole("region", { name: "Estrenos de películas" });
  await userEvent.selectOptions(within(section).getByRole("combobox"), "US");
  await userEvent.type(within(section).getByLabelText("Clave de TMDB"), "  abc123 ");
  await userEvent.click(within(section).getByRole("button", { name: "Guardar" }));
  expect(saved).toEqual(["abc123"]);
  expect(await within(section).findByRole("button", { name: "Borrar" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("dasharr.prefs")!).releaseCountry).toBe("US");
});
