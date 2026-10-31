import type { ArrRating } from "@/api/arr";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";
import { tone } from "./FilmAffinity";

type Source = keyof typeof t.arrRatings;
const PERCENT: Source[] = ["metacritic", "rottenTomatoes"];
const ORDER: Source[] = ["imdb", "tmdb", "rottenTomatoes", "metacritic", "trakt", "tvdb"];

/** Notas que trae Radarr/Sonarr (IMDb, TMDb, Rotten Tomatoes…), una casilla por fuente; sin las que vienen vacías. */
export function ArrRatings({ ratings }: { ratings?: Partial<Record<Source, ArrRating>> }) {
  const [{ hiddenRatings }] = usePrefs();
  const items = ORDER.flatMap((source) => {
    const r = hiddenRatings.includes(source) ? undefined : ratings?.[source];
    return r?.value ? [{ source, value: r.value, votes: r.votes }] : [];
  });
  return (
    <>
      {items.map(({ source, value, votes }) => {
        const percent = PERCENT.includes(source);
        return (
          <div key={source}>
            <div className="text-xs text-muted">{t.arrRatings[source]}</div>
            <div className="text-sm">
              <span className={cn("font-semibold", tone(percent ? value / 10 : value))}>
                {percent ? `${Math.round(value)} %` : formatRating(value)}
              </span>
              {votes ? <span className="ml-1.5 text-xs text-muted">{t.filmaffinity.votes(formatCount(votes))}</span> : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
