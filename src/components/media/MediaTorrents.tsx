import type { UseQueryResult } from "@tanstack/react-query";
import { torrentGroup, type Torrent } from "@/api/qbit";
import { formatBytes, formatDuration, trackerHost } from "@/lib/format";
import { t } from "@/i18n/es";

const ratio = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Conectados y, si el tracker lo da, el total del enjambre. */
const swarm = (connected: number, total?: number) => (total != null && total >= 0 ? t.torrent.of(connected, total) : String(connected));

function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="truncate tabular-nums" title={title ?? value}>
        {value}
      </div>
    </div>
  );
}

function TorrentCard({ tr }: { tr: Torrent }) {
  const host = trackerHost(tr.tracker);
  return (
    <li className="rounded-lg border border-border bg-surface-2/60 p-3">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={tr.name}>
          {tr.name}
        </span>
        <span className="shrink-0 text-xs text-muted">{t.downloads.state[torrentGroup(tr)]}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <Fact label={t.torrent.tracker} value={host ?? "—"} />
        <Fact label={t.library.seedTime} value={formatDuration(tr.seeding_time)} />
        <Fact label={t.torrent.ratio} value={ratio(tr.ratio)} title={`${t.torrent.uploaded}: ${formatBytes(tr.uploaded)}`} />
        <Fact label={t.torrent.seeds} value={swarm(tr.num_seeds, tr.num_complete)} />
        <Fact label={t.library.leechers} value={swarm(tr.num_leechs, tr.num_incomplete)} />
        <Fact label={t.library.size} value={formatBytes(tr.size)} />
      </div>
    </li>
  );
}

/** Los torrents que se quitarían de qBittorrent, con lo importante para decidir (tracker, ratio, tiempo sembrado…). */
export function MediaTorrents({ q }: { q: UseQueryResult<Torrent[]> }) {
  if (q.isPending) return <p className="text-xs text-muted">{t.library.torrentsLooking}</p>;
  if (q.isError) return <p className="text-xs text-warning">{t.library.torrentsLookupFailed}</p>;
  if (q.data.length === 0) return <p className="text-xs text-muted">{t.library.torrentsNone}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted">{t.library.torrentsFound(q.data.length)}</div>
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
        {q.data.map((tr) => (
          <TorrentCard key={tr.hash} tr={tr} />
        ))}
      </ul>
    </div>
  );
}
