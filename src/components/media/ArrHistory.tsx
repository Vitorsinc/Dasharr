import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleSlash } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Spinner } from "@/components/ui";
import type { ArrService, HistoryRecord } from "@/api/arr";
import { arrActivity } from "@/api/arrActivity";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

const tone: Record<string, string> = {
  grabbed: "text-accent",
  downloadFolderImported: "text-success",
  seriesFolderImported: "text-success",
  movieFolderImported: "text-success",
  downloadFailed: "text-danger",
  movieFileDeleted: "text-warning",
  episodeFileDeleted: "text-warning",
};

export function historyEventLabel(r: Pick<HistoryRecord, "eventType">) {
  return t.arrHistory.events[r.eventType] ?? t.arrHistory.unknown;
}

/** Detalle de una línea: indexador y cliente al enviarla, motivo al fallar o al borrarse el archivo. */
export function historyDetail(r: HistoryRecord): string {
  const d = r.data ?? {};
  const parts: string[] = [];
  if (r.quality?.quality?.name) parts.push(r.quality.quality.name);
  if (r.eventType === "grabbed") {
    if (d.indexer) parts.push(d.indexer);
    if (d.downloadClientName ?? d.downloadClient) parts.push((d.downloadClientName ?? d.downloadClient)!);
  }
  if (r.eventType === "downloadFailed" && d.message) parts.push(d.message);
  if (r.eventType.endsWith("FileDeleted") && d.reason) parts.push(t.arrHistory.reasons[d.reason] ?? d.reason);
  return parts.join(" · ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Solo una descarga enviada («grabbed») se puede marcar como fallida. */
export const canMarkFailed = (r: Pick<HistoryRecord, "eventType">) => r.eventType === "grabbed";

/** Botón «Marcar como fallida» de una línea del historial, con confirmación. */
export function MarkFailedButton({ service, record }: { service: ArrService; record: HistoryRecord }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  if (!canMarkFailed(record)) return null;
  async function mark() {
    try {
      await arrActivity(service).markFailed(record.id);
      toast.success(t.markFailed.done);
      // Cambia el historial, la blocklist y quizá la cola: se refresca todo lo del servicio.
      await qc.invalidateQueries({ queryKey: [service] });
    } catch (e) {
      toast.error(errorMessage(e, service));
    }
  }
  return (
    <>
      <button
        className="btn-ghost shrink-0 p-1 text-muted hover:text-danger"
        title={t.markFailed.action}
        aria-label={`${t.markFailed.action}: ${record.sourceTitle}`}
        onClick={() => setConfirm(true)}
      >
        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
      </button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.markFailed.title}
        message={t.markFailed.message(record.sourceTitle)}
        confirmLabel={t.markFailed.action}
        onConfirm={() => void mark()}
      />
    </>
  );
}

/** Historial de Radarr/Sonarr de una película o serie, plegado hasta que se pide (no carga nada antes). */
export function ArrHistory({ service, id, load }: { service: ArrService; id: number; load: () => Promise<HistoryRecord[]> }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: [service, "history", id], queryFn: load, enabled: open });
  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        {t.arrHistory.title}
        {q.data && <span className="text-xs font-normal text-muted">({q.data.length})</span>}
      </button>
      {open && (
        <div className="border-t border-border">
          {q.isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : q.isError ? (
            <div className="p-3">
              <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} compact />
            </div>
          ) : !q.data?.length ? (
            <p className="px-4 py-3 text-sm text-muted">{t.arrHistory.empty}</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {q.data.map((r) => {
                const detail = historyDetail(r);
                return (
                  <li key={r.id} className="px-4 py-2 text-sm">
                    <div className="flex items-baseline gap-3">
                      <span className={cn("w-36 shrink-0 font-medium", tone[r.eventType])}>{historyEventLabel(r)}</span>
                      {r.episode && (
                        <span className="shrink-0 tabular-nums text-muted">
                          {r.episode.seasonNumber}x{pad(r.episode.episodeNumber)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate" title={r.sourceTitle}>
                        {r.sourceTitle}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(r.date)}</span>
                      <MarkFailedButton service={service} record={r} />
                    </div>
                    {detail && (
                      <div className="truncate pl-[9.75rem] text-xs text-muted" title={detail}>
                        {detail}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
