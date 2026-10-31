import { ExternalLink } from "lucide-react";
import type { FaItem } from "@/api/filmaffinity";
import { useFaRating } from "@/hooks/useFilmAffinity";
import { usePrefs } from "@/hooks/usePrefs";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";
import { t } from "@/i18n/es";

export function tone(rating: number) {
  if (rating >= 7) return "text-success";
  if (rating >= 5) return "text-warning";
  return "text-danger";
}

/** Nota y enlace en la ficha de una película o serie. */
export function FaInfo({ item }: { item: FaItem }) {
  const [{ hiddenRatings }] = usePrefs();
  const hidden = hiddenRatings.includes("filmaffinity");
  const q = useFaRating(hidden ? null : item);
  if (hidden) return null;
  const m = q.data;
  let value: React.ReactNode;
  if (q.isLoading) value = <span className="text-muted">{t.filmaffinity.loading}</span>;
  else if (q.isError) value = <span className="text-muted">{t.filmaffinity.unavailable}</span>;
  else if (!m) value = <span className="text-muted">{t.filmaffinity.notFound}</span>;
  else
    value = (
      <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline" title={t.filmaffinity.open}>
        {m.rating != null ? (
          <span className={cn("font-semibold", tone(m.rating))}>{formatRating(m.rating)}</span>
        ) : (
          <span className="text-muted">{t.filmaffinity.noRating}</span>
        )}
        {m.votes ? <span className="text-xs text-muted">{t.filmaffinity.votes(formatCount(m.votes))}</span> : null}
        <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden />
      </a>
    );
  return (
    <div>
      <div className="text-xs text-muted">{t.filmaffinity.label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
