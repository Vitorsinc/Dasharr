import { Check, CircleDashed } from "lucide-react";
import type { MyWatch } from "@/api/tracearr";
import { watchLabel } from "@/components/media/PosterCard";
import { t } from "@/i18n/es";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/** `last_watched_day` es un día UTC (AAAA-MM-DD): a mediodía para que no cambie de fecha con la zona horaria. */
const day = (d: string) => formatDate(`${d}T12:00:00Z`);

/** Ficha de película o serie: si lo has visto tú, cuántas veces y cuándo por última vez. */
export function MyWatchChip({ watch }: { watch?: MyWatch }) {
  if (!watch) return null;
  const done = watch.state === "watched";
  const parts = [watchLabel(watch), !watch.episodeCount && watch.plays > 1 ? t.myWatch.times(watch.plays) : null, t.myWatch.lastDay(day(watch.last))];
  return (
    <span className={cn("chip w-fit gap-1.5", done ? "bg-plex/15 text-plex" : "bg-surface-2 text-fg")}>
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <CircleDashed className="h-3.5 w-3.5 text-plex" aria-hidden />}
      {parts.filter(Boolean).join(" · ")}
    </span>
  );
}

/** Marca de un episodio en la lista de temporadas. Ocupa siempre su hueco para que las filas no bailen. */
export function EpisodeWatchMark({ watch }: { watch?: MyWatch }) {
  if (!watch) return <span className="w-4 shrink-0" aria-hidden />;
  const label = watch.state === "watched" ? t.myWatch.watched : t.myWatch.episodeStarted;
  return (
    <span className="grid w-4 shrink-0 place-items-center text-plex" title={label} aria-label={label} role="img">
      {watch.state === "watched" ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}
    </span>
  );
}
