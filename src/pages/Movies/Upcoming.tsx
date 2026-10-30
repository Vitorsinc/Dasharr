import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Poster } from "@/components/media/PosterCard";
import { Empty } from "@/components/ui";
import { posterUrl } from "@/api/arr";
import type { Movie } from "@/api/radarr";
import { useMovieReleases, useTmdbHasKey } from "@/hooks/useMovieReleases";
import { usePrefs } from "@/hooks/usePrefs";
import { startOfDay } from "@/lib/dates";
import { countryName } from "@/lib/countries";
import { nextReleases } from "@/lib/releases";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";

const STEP = 100;
const dayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const yearFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

function formatDay(d: Date, today: Date) {
  return (d.getFullYear() === today.getFullYear() ? dayFmt : yearFmt).format(d);
}

/** Pestaña "Próximos": estrenos en cines, digital y física que tienen por delante las películas de la biblioteca. */
export function UpcomingMovies({ movies, onOpen }: { movies: Movie[]; onOpen: (id: number) => void }) {
  const [{ releaseCountry }] = usePrefs();
  const hasKey = useTmdbHasKey().data === true;
  const releasesOf = useMovieReleases(movies);
  const [shown, setShown] = useState(STEP);
  const today = useMemo(() => startOfDay(new Date()), []);
  const rows = useMemo(
    () =>
      movies
        .map((m) => ({ movie: m, next: nextReleases(releasesOf(m), today) }))
        .filter((r) => r.next.length)
        .sort((a, b) => a.next[0].date.getTime() - b.next[0].date.getTime()),
    [movies, releasesOf, today],
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {hasKey ? (
          t.premieres.countryDates(countryName(releaseCountry))
        ) : (
          <Link to="/ajustes" className="hover:underline">
            {t.premieres.radarrDates}
          </Link>
        )}
      </p>
      {!rows.length ? (
        <Empty>{t.premieres.nothing}</Empty>
      ) : (
        <div className="card divide-y divide-border">
          {rows.slice(0, shown).map(({ movie: m, next }) => (
            <button
              key={m.id}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
              onClick={() => onOpen(m.id)}
            >
              <Poster
                src={posterUrl("radarr", m, 250)}
                title={m.title}
                className={cn("w-10 shrink-0 rounded", m.hasFile && "opacity-60")}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.title} <span className="text-muted">({m.year})</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {next.map((r) => (
                    <span
                      key={r.kind}
                      className={cn("chip", r.kind === next[0].kind ? "bg-radarr/15 text-radarr" : "bg-surface-2 text-muted")}
                    >
                      {t.premieres.kind[r.kind]} · {formatDay(r.date, today)}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
          {rows.length > shown && (
            <button className="w-full px-4 py-2 text-sm text-accent hover:bg-surface-2" onClick={() => setShown((n) => n + STEP)}>
              {t.wanted.showMore(Math.min(STEP, rows.length - shown))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
