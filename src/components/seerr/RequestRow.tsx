import { useState } from "react";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/ui";
import { MediaStatus, RequestStatus, seerr, titleOf, tmdbImage, userName, yearOf, type MediaRequest, type SeerrUser } from "@/api/seerr";
import { useSeerrMedia, useSeerrRun } from "@/hooks/useSeerr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatAge } from "@/lib/format";
import { imageUrl } from "@/lib/tauri";

const requestTone: Record<number, string> = {
  [RequestStatus.Pending]: "bg-warning/15 text-warning",
  [RequestStatus.Approved]: "bg-accent/15 text-accent",
  [RequestStatus.Declined]: "bg-danger/15 text-danger",
  [RequestStatus.Failed]: "bg-danger/15 text-danger",
  [RequestStatus.Completed]: "bg-success/15 text-success",
};

const mediaTone: Record<number, string> = {
  [MediaStatus.Processing]: "bg-accent/15 text-accent",
  [MediaStatus.PartiallyAvailable]: "bg-success/15 text-success",
  [MediaStatus.Available]: "bg-success/15 text-success",
};

/** Avatar de un usuario de Seerr: las rutas relativas (`/avatarproxy/…`) se piden a Seerr con la API key. */
export function SeerrAvatar({ user, className }: { user?: SeerrUser | null; className?: string }) {
  const a = user?.avatar;
  const src = a ? (/^https?:\/\//i.test(a) ? a : imageUrl("seerr", a)) : undefined;
  return <Avatar name={userName(user)} sources={[src]} className={className} />;
}

export function RequestStatusChip({ status }: { status: number }) {
  return <span className={cn("chip", requestTone[status] ?? "bg-surface-2 text-muted")}>{t.seerr.requestStatus[status] ?? status}</span>;
}

/** Disponibilidad del contenido; solo se enseña cuando dice algo (en proceso, parcial o disponible). */
export function MediaStatusChip({ status }: { status: number | undefined }) {
  if (!status || !mediaTone[status]) return null;
  return <span className={cn("chip", mediaTone[status])}>{t.seerr.mediaStatus[status]}</span>;
}

/** Una solicitud: póster, título, temporadas, estado, quién la pidió y las acciones que admite. */
export function RequestRow({ request, compact }: { request: MediaRequest; compact?: boolean }) {
  const run = useSeerrRun();
  const details = useSeerrMedia(request.type, request.media?.tmdbId);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const title = details.data ? titleOf(details.data) : `TMDB ${request.media?.tmdbId ?? "?"}`;
  const year = details.data ? yearOf(details.data) : "";
  const seasons = (request.seasons ?? []).map((s) => s.seasonNumber).sort((a, b) => a - b);
  const poster = tmdbImage(details.data?.posterPath, "w185");

  async function act(kind: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    await run(fn, ok);
    setBusy(null);
  }

  const pending = request.status === RequestStatus.Pending;
  const failed = request.status === RequestStatus.Failed;

  return (
    <div className={cn("flex items-center gap-4 px-4", compact ? "py-2.5" : "py-3")}>
      <div className={cn("shrink-0 overflow-hidden rounded-md bg-surface-2", compact ? "h-14 w-10" : "h-[72px] w-12")}>
        {poster && <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium" title={title}>
            {title}
          </span>
          {year && <span className="shrink-0 text-xs tabular-nums text-muted">{year}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="chip bg-surface-2 text-muted">{request.type === "movie" ? t.seerr.movie : t.seerr.tv}</span>
          {request.is4k && <span className="chip bg-surface-2 font-semibold text-fg">4K</span>}
          <RequestStatusChip status={request.status} />
          {request.status !== RequestStatus.Declined && <MediaStatusChip status={request.is4k ? request.media?.status4k : request.media?.status} />}
          {seasons.length > 0 && <span>{t.seerr.seasons(seasons)}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <SeerrAvatar user={request.requestedBy} className="h-4 w-4 text-[9px]" />
          <span className="truncate">
            {t.seerr.requestedBy(userName(request.requestedBy), formatAge(request.createdAt))}
            {!compact && request.modifiedBy && !pending ? ` · ${t.seerr.modifiedBy(userName(request.modifiedBy))}` : ""}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {pending && (
          <>
            <button
              className="btn-primary px-2.5 py-1.5"
              disabled={!!busy}
              onClick={() => act("approve", () => seerr.approve(request.id), t.seerr.approved(title))}
              aria-label={`${t.seerr.approve}: ${title}`}
            >
              {busy === "approve" ? <Spinner className="h-4 w-4 text-accent-fg" /> : <Check className="h-4 w-4" aria-hidden />}
              {!compact && t.seerr.approve}
            </button>
            <button
              className="btn-outline px-2.5 py-1.5 hover:text-danger"
              disabled={!!busy}
              onClick={() => act("decline", () => seerr.decline(request.id), t.seerr.declined(title))}
              aria-label={`${t.seerr.decline}: ${title}`}
            >
              {busy === "decline" ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" aria-hidden />}
              {!compact && t.seerr.decline}
            </button>
          </>
        )}
        {failed && (
          <button
            className="btn-outline px-2.5 py-1.5"
            disabled={!!busy}
            onClick={() => act("retry", () => seerr.retry(request.id), t.seerr.retried(title))}
            aria-label={`${t.seerr.retry}: ${title}`}
          >
            {busy === "retry" ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" aria-hidden />}
            {!compact && t.seerr.retry}
          </button>
        )}
        {!compact && (
          <button
            className="btn-ghost p-1.5 text-muted hover:text-danger"
            title={t.common.delete}
            aria-label={`${t.common.delete}: ${title}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t.seerr.deleteTitle}
        message={t.seerr.deleteMessage(title)}
        onConfirm={() => run(() => seerr.deleteRequest(request.id), t.seerr.deleted)}
      />
    </div>
  );
}
