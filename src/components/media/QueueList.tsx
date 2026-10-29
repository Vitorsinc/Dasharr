import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { arrCommon, type ArrService, type QueueRecord } from "@/api/arr";
import { Dialog } from "@/components/Dialog";
import { ManualImportDialog } from "./ManualImportDialog";
import { Empty, ProgressBar } from "@/components/ui";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

function label(r: QueueRecord) {
  if (r.movie) return `${r.movie.title}${r.movie.year ? ` (${r.movie.year})` : ""}`;
  if (r.series && r.episode)
    return `${r.series.title} · ${r.episode.seasonNumber}x${String(r.episode.episodeNumber).padStart(2, "0")} ${r.episode.title}`;
  return r.title;
}

function warnings(r: QueueRecord) {
  const msgs = (r.statusMessages ?? []).flatMap((m) => m.messages ?? (m.title ? [m.title] : []));
  if (r.errorMessage) msgs.unshift(r.errorMessage);
  return msgs;
}

/** Elementos retenidos por el perfil de retraso: aún no se han enviado al cliente de descargas. */
const isDelayed = (r: QueueRecord) => r.status === "delay";

function RemoveDialog({ service, record, onClose }: { service: ArrService; record: QueueRecord | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [removeFromClient, setRemoveFromClient] = useState(true);
  const [blocklist, setBlocklist] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!record) return null;
  async function confirm() {
    setBusy(true);
    try {
      await arrCommon(service).removeFromQueue(record!.id, { removeFromClient: removeFromClient && !isDelayed(record!), blocklist });
      toast.success(t.library.removed);
      void qc.invalidateQueries({ queryKey: [service, "queue"] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, service));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.library.removeTitle(label(record))}>
      <div className="flex flex-col gap-4 text-sm">
        {!isDelayed(record) && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={removeFromClient} onChange={(e) => setRemoveFromClient(e.target.checked)} />
            {t.library.removeFromClient}
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={blocklist} onChange={(e) => setBlocklist(e.target.checked)} />
          {t.library.blocklist}
        </label>
        <p className="text-xs text-muted">{t.library.removeHint}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-danger" disabled={busy} onClick={confirm}>
            {t.library.remove}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function QueueList({ service, records }: { service: ArrService; records: QueueRecord[] }) {
  const qc = useQueryClient();
  const [importing, setImporting] = useState<QueueRecord | null>(null);
  const [removing, setRemoving] = useState<QueueRecord | null>(null);
  async function grabNow(r: QueueRecord) {
    try {
      await arrCommon(service).grabQueueItem(r.id);
      toast.success(t.library.grabbed, { description: label(r) });
      void qc.invalidateQueries({ queryKey: [service, "queue"] });
    } catch (e) {
      toast.error(errorMessage(e, service));
    }
  }
  if (!records.length) return <Empty>{t.library.emptyQueue}</Empty>;
  return (
    <>
      <div className="card divide-y divide-border">
        {records.map((r) => {
          const progress = r.size > 0 ? 1 - r.sizeleft / r.size : 0;
          return (
            <div key={r.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{label(r)}</div>
                <div className="truncate text-xs text-muted" title={r.title}>
                  {r.title} · {formatBytes(r.size)} · {r.trackedDownloadState ?? r.status}
                </div>
                {r.trackedDownloadStatus && r.trackedDownloadStatus !== "ok" && warnings(r).length > 0 && (
                  <div className="mt-1 flex items-start gap-1 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2" title={warnings(r).join("\n")}>
                      {warnings(r).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
              {isDelayed(r) && (
                <button
                  className="btn-ghost p-1.5"
                  title={t.library.grabNow}
                  aria-label={`${t.library.grabNow}: ${label(r)}`}
                  onClick={() => grabNow(r)}
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
              {r.downloadId && (
                <button
                  className="btn-ghost p-1.5"
                  title={t.manualImport.action}
                  aria-label={`${t.manualImport.action}: ${label(r)}`}
                  onClick={() => setImporting(r)}
                >
                  <FileInput className="h-4 w-4" />
                </button>
              )}
              <button
                className="btn-ghost p-1.5"
                title={t.library.remove}
                aria-label={`${t.library.remove}: ${label(r)}`}
                onClick={() => setRemoving(r)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="w-48">
                <ProgressBar value={progress} />
                <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
                  <span>{Math.round(progress * 100)} %</span>
                  {r.timeleft && <span>{r.timeleft}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <RemoveDialog key={removing?.id} service={service} record={removing} onClose={() => setRemoving(null)} />
      <ManualImportDialog
        service={service}
        downloadId={importing?.downloadId ?? null}
        what={importing ? label(importing) : ""}
        onClose={() => setImporting(null)}
      />
    </>
  );
}
