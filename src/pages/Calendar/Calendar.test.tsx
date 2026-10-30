import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mergeCalendar } from "@/api/calendar";
import { movieReleases } from "@/lib/releases";
import { mockBackend, renderApp } from "@/test/utils";
import { addDays, dayKey, startOfWeek } from "@/lib/dates";
import type { Movie } from "@/api/radarr";
import type { Episode } from "@/api/sonarr";

test("mergeCalendar pone el estreno en cines y el digital (o el físico si no hay digital), y ordena", () => {
  const movies = [
    {
      id: 1,
      title: "A",
      year: 2025,
      hasFile: false,
      inCinemas: "2025-01-10T00:00:00Z",
      digitalRelease: "2025-03-01T00:00:00Z",
      physicalRelease: "2025-04-01T00:00:00Z",
    },
    { id: 2, title: "B", year: 2025, hasFile: false, physicalRelease: "2025-02-01T00:00:00Z" },
    { id: 3, title: "Sin fecha", year: 2025, hasFile: false },
  ] as Movie[];
  const eps = [
    {
      id: 9,
      seasonNumber: 2,
      episodeNumber: 3,
      title: "Ep",
      airDateUtc: "2025-02-15T00:00:00Z",
      hasFile: true,
      series: { title: "Serie" },
    },
  ] as Episode[];
  const r = mergeCalendar(movies, eps);
  expect(r.map((i) => i.id)).toEqual(["m-1-cinema", "m-2-physical", "e-9", "m-1-digital"]);
  expect(r[0]).toMatchObject({ subtitle: "En cines · 2025", release: "cinema" });
  expect(r[2]).toMatchObject({ source: "sonarr", title: "Serie", subtitle: "2x03 · Ep", hasFile: true });
  // Día de estreno a medianoche local, sin desplazarse por la zona horaria.
  expect(r[3].date).toEqual(new Date(2025, 2, 1));
  expect(r[3].subtitle).toBe("Digital · 2025");
});

test("mergeCalendar usa las fechas del país si las hay y solo las del rango", () => {
  const movies = [
    { id: 1, title: "A", year: 2025, hasFile: false, inCinemas: "2025-01-10T00:00:00Z", digitalRelease: "2025-03-01T00:00:00Z" },
  ] as Movie[];
  const r = mergeCalendar(movies, [], {
    releasesOf: (m) => movieReleases(m, { cinema: "2025-02-07" }),
    start: new Date(2025, 1, 1),
    end: new Date(2025, 1, 28),
  });
  expect(r.map((i) => [i.id, i.date])).toEqual([["m-1-cinema", new Date(2025, 1, 7)]]);
});

test("coloca los elementos en su día de la semana y cambia a vista mensual", async () => {
  const wed = addDays(startOfWeek(new Date()), 2);
  wed.setHours(20);
  mockBackend({
    api: {
      radarr: () => [{ id: 1, title: "Película X", year: 2026, hasFile: false, monitored: true, digitalRelease: wed.toISOString() }],
      sonarr: () => [],
    },
  });
  renderApp("/calendario");
  const chip = await screen.findByText("Película X");
  expect(chip.closest("[data-testid^='day-']")).toHaveAttribute("data-testid", `day-${dayKey(wed)}`);
  await userEvent.click(screen.getByRole("tab", { name: "Mes" }));
  expect(screen.getAllByTestId(/^day-/)).toHaveLength(42);
});

test("mergeCalendar usa el fanart como fondo y, si no hay, el póster", () => {
  const movies = [
    {
      id: 1,
      title: "Con fanart",
      year: 2025,
      hasFile: false,
      inCinemas: "2025-01-10T00:00:00Z",
      images: [
        { coverType: "poster", remoteUrl: "https://img/p1.jpg" },
        { coverType: "fanart", remoteUrl: "https://img/f1.jpg" },
      ],
    },
    {
      id: 2,
      title: "Solo póster",
      year: 2025,
      hasFile: false,
      inCinemas: "2025-01-11T00:00:00Z",
      images: [{ coverType: "poster", remoteUrl: "https://img/p2.jpg" }],
    },
  ] as Movie[];
  const [a, b] = mergeCalendar(movies, []);
  expect(a.backdrop).toBe("https://img/f1.jpg");
  expect(b.backdrop).toBe("https://img/p2.jpg");
});
