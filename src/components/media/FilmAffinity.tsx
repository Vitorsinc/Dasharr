import { ExternalLink } from "lucide-react";
import type { FaItem } from "@/api/filmaffinity";
import { useFaRating } from "@/hooks/useFilmAffinity";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";
import { t } from "@/i18n/es";

function tone(rating: number) {
  if (rating >= 7) return "text-success";
  if (rating >= 5) return "text-warning";
  return "text-danger";
}

/** Nota sobre el póster de las listas. */
export function FaBadge({ rating }: { rating?: number | null }) {
  if (rating == null) return null;
  const r = formatRating(rating);
  return (
    <span
      className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur"
      title={t.filmaffinity.badge(r)}
    >
      <span className="text-[9px] font-bold tracking-wide text-white/70">FA</span>
      <span className={tone(rating)}>{r}</span>
    </span>
  );
}

/** Nota y enlace en la ficha de una película o serie. */
export function FaInfo({ item }: { item: FaItem }) {
  const q = useFaRating(item);
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
