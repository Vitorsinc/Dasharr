import { Fragment } from "react";
import type { ArrRating } from "@/api/arr";
import { RATING_SOURCES, type RatingSource } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatRating } from "@/lib/format";
import { tone } from "./FilmAffinity";
import type { Scores } from "./library";
import filmaffinityIcon from "@/assets/ratings/filmaffinity.png";
import letterboxdIcon from "@/assets/ratings/letterboxd.svg";
import imdbIcon from "@/assets/ratings/imdb.svg";
import tmdbIcon from "@/assets/ratings/tmdb.svg";
import rottenTomatoesIcon from "@/assets/ratings/rottentomatoes.svg";
import metacriticIcon from "@/assets/ratings/metacritic.svg";
import traktIcon from "@/assets/ratings/trakt.svg";
import tvdbIcon from "@/assets/ratings/tvdb.svg";

/** Fuentes que vienen en porcentaje (0-100) en vez de sobre 10. */
export const PERCENT_SOURCES: RatingSource[] = ["metacritic", "rottenTomatoes"];
const ICONS: Record<RatingSource, string> = {
  filmaffinity: filmaffinityIcon,
  letterboxd: letterboxdIcon,
  imdb: imdbIcon,
  tmdb: tmdbIcon,
  rottenTomatoes: rottenTomatoesIcon,
  metacritic: metacriticIcon,
  trakt: traktIcon,
  tvdb: tvdbIcon,
};

/** Icono de la web de una valoración. Decorativo: el nombre va siempre al lado o en el título. */
export function RatingIcon({ source, className }: { source: RatingSource; className?: string }) {
  return <img src={ICONS[source]} alt="" aria-hidden draggable={false} className={cn("h-4 w-4 shrink-0 rounded-[3px] object-contain", className)} />;
}

export function ratingName(source: RatingSource) {
  if (source === "filmaffinity") return t.filmaffinity.label;
  if (source === "letterboxd") return t.letterboxd.label;
  return t.arrRatings[source];
}

/** Letterboxd puntúa sobre 5 (de media en media estrella). */
export const FIVE_STAR_SOURCES: RatingSource[] = ["letterboxd"];

export function formatScore(source: RatingSource, value: number) {
  if (PERCENT_SOURCES.includes(source)) return `${Math.round(value)} %`;
  // Con dos decimales, como en Letterboxd («3,90»), para no confundirla con una nota sobre 10.
  if (FIVE_STAR_SOURCES.includes(source)) return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatRating(value);
}

/** Color según la nota llevada a una escala sobre 10. */
export function scoreTone(source: RatingSource, value: number) {
  if (PERCENT_SOURCES.includes(source)) return tone(value / 10);
  if (FIVE_STAR_SOURCES.includes(source)) return tone(value * 2);
  return tone(value);
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
            <RatingIcon source={source} className="h-3.5 w-3.5 self-center" />
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
