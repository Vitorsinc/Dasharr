import { ExternalLink } from "lucide-react";
import { useLbRating } from "@/hooks/useLetterboxd";
import { usePrefs } from "@/hooks/usePrefs";
import { cn } from "@/lib/cn";
import { formatCount, formatCountShort } from "@/lib/format";
import { Fact } from "./DetailFacts";
import { formatScore, scoreTone } from "./RatingBadges";
import { t } from "@/i18n/es";

/** Nota de Letterboxd (sobre 5) y enlace en la ficha de una película, en una línea de la columna del póster. */
export function LbInfo({ tmdbId }: { tmdbId: number }) {
  const [{ hiddenRatings }] = usePrefs();
  const hidden = hiddenRatings.includes("letterboxd") || !tmdbId;
  const q = useLbRating(hidden ? null : tmdbId);
  if (hidden) return null;
  const m = q.data;
  let value: React.ReactNode;
  if (q.isLoading) value = <span className="text-muted">{t.filmaffinity.loading}</span>;
  else if (q.isError) value = <span className="text-muted">{t.filmaffinity.unavailable}</span>;
  else if (!m) value = <span className="text-muted">{t.filmaffinity.notFound}</span>;
  else
    value = (
      <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline" title={t.letterboxd.open}>
        {m.rating != null ? (
          <span className={cn("font-semibold tabular-nums", scoreTone("letterboxd", m.rating))}>{formatScore("letterboxd", m.rating)}</span>
        ) : (
          <span className="text-muted">{t.filmaffinity.noRating}</span>
        )}
        {m.votes ? (
          <span className="text-xs text-muted" title={t.filmaffinity.votes(formatCount(m.votes))}>
            {formatCountShort(m.votes)}
          </span>
        ) : null}
        <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden />
      </a>
    );
  return <Fact label={t.letterboxd.label} value={value} />;
}
