import type { QueueRecord } from "@/api/arr";
import { Empty, ProgressBar } from "@/components/ui";
import { t } from "@/i18n/es";
import { formatBytes } from "@/lib/format";

function label(r: QueueRecord) {
  if (r.movie) return `${r.movie.title}${r.movie.year ? ` (${r.movie.year})` : ""}`;
  if (r.series && r.episode)
    return `${r.series.title} · ${r.episode.seasonNumber}x${String(r.episode.episodeNumber).padStart(2, "0")} ${r.episode.title}`;
  return r.title;
}

export function QueueList({ records }: { records: QueueRecord[] }) {
  if (!records.length) return <Empty>{t.library.emptyQueue}</Empty>;
  return (
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
            </div>
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
  );
}
