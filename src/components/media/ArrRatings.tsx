import type { ArrRating } from "@/api/arr";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatCount, formatCountShort } from "@/lib/format";
import { Fact } from "./DetailFacts";
import { formatScore, scoreTone } from "./RatingBadges";

type Source = keyof typeof t.arrRatings;
const ORDER: Source[] = ["imdb", "tmdb", "rottenTomatoes", "metacritic", "trakt", "tvdb"];

/**
 * Notas que trae Radarr/Sonarr (IMDb, TMDb, Rotten Tomatoes…), una casilla por fuente; sin las que vienen vacías.
 * `list`: una línea por fuente, con los votos abreviados, para la columna estrecha del póster.
 */
export function ArrRatings({ ratings, list }: { ratings?: Partial<Record<Source, ArrRating>>; list?: boolean }) {
  const [{ hiddenRatings }] = usePrefs();
  const items = ORDER.flatMap((source) => {
    const r = hiddenRatings.includes(source) ? undefined : ratings?.[source];
    return r?.value ? [{ source, value: r.value, votes: r.votes }] : [];
  });
  return (
    <>
      {items.map(({ source, value, votes }) => {
        if (list)
          return (
            <Fact
              key={source}
              label={t.arrRatings[source]}
              title={votes ? t.filmaffinity.votes(formatCount(votes)) : undefined}
              value={
                <>
                  <span className={cn("font-semibold tabular-nums", scoreTone(source, value))}>{formatScore(source, value)}</span>
                  {votes ? <span className="ml-1.5 text-xs text-muted">{formatCountShort(votes)}</span> : null}
                </>
              }
            />
          );
        return (
          <div key={source}>
            <div className="text-xs text-muted">{t.arrRatings[source]}</div>
            <div className="text-sm">
              <span className={cn("font-semibold", scoreTone(source, value))}>{formatScore(source, value)}</span>
              {votes ? <span className="ml-1.5 text-xs text-muted">{t.filmaffinity.votes(formatCount(votes))}</span> : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
