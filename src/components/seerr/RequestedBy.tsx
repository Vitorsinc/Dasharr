import { Inbox } from "lucide-react";
import { userName, type MediaType } from "@/api/seerr";
import { useSeerrMedia } from "@/hooks/useSeerr";
import { Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { formatDateTime } from "@/lib/format";
import { RequestStatusChip, SeerrAvatar } from "./RequestRow";

/**
 * Quién pidió esta película o serie en Seerr, cuándo y qué temporadas, como el historial de Tracearr.
 * No se ve sin Seerr o sin TMDB id; si nadie la pidió, lo dice.
 */
export function RequestedBy({ type, tmdbId }: { type: MediaType; tmdbId: number | undefined | null }) {
  const q = useSeerrMedia(type, tmdbId || undefined);
  if (q.configured !== true || !tmdbId) return null;
  const requests = [...(q.data?.mediaInfo?.requests ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="flex flex-col gap-2" aria-label={t.seerr.requestedTitle}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Inbox className="h-4 w-4 text-muted" aria-hidden /> {t.seerr.requestedTitle}
      </h3>
      {q.isLoading ? (
        <Spinner className="h-4 w-4" />
      ) : q.isError ? (
        <p className="text-xs text-muted">{t.seerr.requestedUnknown}</p>
      ) : !requests.length ? (
        <p className="text-xs text-muted">{t.seerr.nobodyRequested}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {requests.map((r) => {
            const seasons = (r.seasons ?? []).map((s) => s.seasonNumber).sort((a, b) => a - b);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <SeerrAvatar user={r.requestedBy} />
                <span className="min-w-0 truncate font-medium">{userName(r.requestedBy)}</span>
                <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
                <RequestStatusChip status={r.status} />
                {r.is4k && <span className="chip bg-surface-2 font-semibold text-fg">4K</span>}
                {seasons.length > 0 && <span className="text-xs text-muted">{t.seerr.seasons(seasons)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
