import { useState } from "react";
import { AlertTriangle, FileInput } from "lucide-react";
import type { ArrService, QueueRecord } from "@/api/arr";
import { ManualImportDialog } from "./ManualImportDialog";
import { Empty, ProgressBar } from "@/components/ui";
import { t } from "@/i18n/es";
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

export function QueueList({ service, records }: { service: ArrService; records: QueueRecord[] }) {
  const [importing, setImporting] = useState<QueueRecord | null>(null);
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
      <ManualImportDialog
        service={service}
        downloadId={importing?.downloadId ?? null}
        what={importing ? label(importing) : ""}
        onClose={() => setImporting(null)}
      />
    </>
  );
}
