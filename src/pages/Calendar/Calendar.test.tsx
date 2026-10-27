import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mergeCalendar } from "@/api/calendar";
import { mockBackend, renderApp } from "@/test/utils";
import { addDays, dayKey, startOfWeek } from "@/lib/dates";
import type { Movie } from "@/api/radarr";
import type { Episode } from "@/api/sonarr";

test("mergeCalendar usa la fecha digital, luego física, luego cines, y ordena", () => {
  const movies = [
    { id: 1, title: "A", year: 2025, hasFile: false, inCinemas: "2025-01-10T00:00:00Z", digitalRelease: "2025-03-01T00:00:00Z" },
    { id: 2, title: "B", year: 2025, hasFile: false, inCinemas: "2025-02-01T00:00:00Z" },
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
  expect(r.map((i) => i.id)).toEqual(["m-2", "e-9", "m-1"]);
  expect(r[1]).toMatchObject({ source: "sonarr", title: "Serie", subtitle: "2x03 · Ep", hasFile: true });
  expect(r[2].date.toISOString()).toBe("2025-03-01T00:00:00.000Z");
});

test("coloca los elementos en su día de la semana y cambia a vista mensual", async () => {
  const wed = addDays(startOfWeek(new Date()), 2);
  wed.setHours(20);
  mockBackend({
    api: {
      radarr: () => [{ id: 1, title: "Película X", year: 2026, hasFile: false, digitalRelease: wed.toISOString() }],
      sonarr: () => [],
    },
  });
  renderApp("/calendario");
  const chip = await screen.findByText("Película X");
  expect(chip.closest("[data-testid^='day-']")).toHaveAttribute("data-testid", `day-${dayKey(wed)}`);
  await userEvent.click(screen.getByRole("tab", { name: "Mes" }));
  expect(screen.getAllByTestId(/^day-/)).toHaveLength(42);
});
