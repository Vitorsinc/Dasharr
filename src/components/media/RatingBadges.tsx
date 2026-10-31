import type { ArrRating } from "@/api/arr";
import { RATING_SOURCES, type RatingSource } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
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

/** Notas sobre el póster de las listas, una pastilla por fuente. */
export function RatingBadges({ scores }: { scores?: Scores }) {
  const items = RATING_SOURCES.flatMap((s) => (scores?.[s] != null ? [{ source: s, value: scores[s]! }] : []));
  if (!items.length) return null;
  return (
    <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end gap-1">
      {items.map(({ source, value }) => {
        const v = formatScore(source, value);
        return (
          <span
            key={source}
            className="flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white backdrop-blur"
            title={t.library.ratingBadge(ratingName(source), v)}
          >
            <span className="text-[9px] font-bold tracking-wide text-white/70">{SHORT[source]}</span>
            <span className={scoreTone(source, value)}>{v}</span>
          </span>
        );
      })}
    </div>
  );
}
