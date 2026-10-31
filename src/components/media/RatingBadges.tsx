import { Fragment } from "react";
import type { ArrRating } from "@/api/arr";
import { RATING_SOURCES, type RatingSource } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatRating } from "@/lib/format";
import { tone } from "./FilmAffinity";
import type { Scores } from "./library";

/** Fuentes que vienen en porcentaje (0-100) en vez de sobre 10. */
export const PERCENT_SOURCES: RatingSource[] = ["metacritic", "rottenTomatoes"];
const SHORT: Record<RatingSource, string> = {
  filmaffinity: "FA",
  imdb: "IMDb",
  tmdb: "TMDb",
  rottenTomatoes: "RT",
  metacritic: "MC",
  trakt: "Trakt",
  tvdb: "TVDB",
};

export function ratingName(source: RatingSource) {
  return source === "filmaffinity" ? t.filmaffinity.label : t.arrRatings[source];
}

export function formatScore(source: RatingSource, value: number) {
  return PERCENT_SOURCES.includes(source) ? `${Math.round(value)} %` : formatRating(value);
}

export function scoreTone(source: RatingSource, value: number) {
  return tone(PERCENT_SOURCES.includes(source) ? value / 10 : value);
}

/** Notas de Radarr/Sonarr con valor (las vacías o a cero no cuentan). */
export function arrScores(ratings?: Partial<Record<RatingSource, ArrRating>>): Scores {
  const out: Scores = {};
  for (const [source, r] of Object.entries(ratings ?? {}) as [RatingSource, ArrRating | undefined][]) {
    if (r?.value) out[source] = r.value;
  }
  return out;
}

/** Deja solo las fuentes que el usuario quiere ver. */
export function visibleScores(scores: Scores, hidden: RatingSource[]): Scores {
  const out: Scores = {};
  for (const s of RATING_SOURCES) if (scores[s] != null && !hidden.includes(s)) out[s] = scores[s];
  return out;
}

/** Notas sobre el póster de las listas: un panel en el lateral izquierdo, una fila por fuente con las notas alineadas. */
export function RatingBadges({ scores }: { scores?: Scores }) {
  const items = RATING_SOURCES.flatMap((s) => (scores?.[s] != null ? [{ source: s, value: scores[s]! }] : []));
  if (!items.length) return null;
  return (
    <div className="absolute bottom-2 left-0 grid grid-cols-[auto_auto] gap-x-2 gap-y-1 rounded-r-md bg-black/75 py-1.5 pl-2 pr-2 shadow-md backdrop-blur">
      {items.map(({ source, value }) => {
        const v = formatScore(source, value);
        return (
          <Fragment key={source}>
            <span className="self-center text-[9px] font-bold leading-none tracking-wide text-white/60" aria-hidden>
              {SHORT[source]}
            </span>
            <span
              className={cn("text-right text-xs font-semibold leading-none tabular-nums", scoreTone(source, value))}
              title={t.library.ratingBadge(ratingName(source), v)}
            >
              {v}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
