import type { UseQueryResult } from "@tanstack/react-query";
import { torrentGroup, type Torrent } from "@/api/qbit";
import { formatBytes, formatDuration, trackerHost } from "@/lib/format";
import { t } from "@/i18n/es";

const ratio = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Conectados y, si el tracker lo da, el total del enjambre. */
const swarm = (connected: number, total?: number) => (total != null && total >= 0 ? `${connected}/${total}` : String(connected));

/** Un dato en la fila: etiqueta tenue y valor, todo en una línea. */
function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="whitespace-nowrap" title={title}>
      <span className="text-muted">{label}</span> <span className="tabular-nums text-fg">{value}</span>
    </span>
  );
}

function TorrentCard({ tr }: { tr: Torrent }) {
  const host = trackerHost(tr.tracker);
  return (
    <li className="rounded-md border border-border px-2.5 py-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium" title={tr.name}>
          {tr.name}
        </span>
        <span className="shrink-0 text-xs text-muted">{formatBytes(tr.size)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
        <span className="max-w-[12rem] truncate font-medium text-fg" title={`${t.torrent.tracker}: ${host ?? "—"}`}>
          {host ?? "—"}
        </span>
        <Fact label={t.library.seedTime} value={formatDuration(tr.seeding_time)} title={t.downloads.state[torrentGroup(tr)]} />
        <Fact label={t.torrent.ratio} value={ratio(tr.ratio)} title={`${t.torrent.uploaded}: ${formatBytes(tr.uploaded)}`} />
        <Fact label="Seeds" value={swarm(tr.num_seeds, tr.num_complete)} title={t.library.swarmHint} />
        <Fact label={t.library.leechers} value={swarm(tr.num_leechs, tr.num_incomplete)} title={t.library.swarmHint} />
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
    <div className="flex flex-col gap-1.5">
      <div className="text-xs text-muted">{t.library.torrentsFound(q.data.length)}</div>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {q.data.map((tr) => (
          <TorrentCard key={tr.hash} tr={tr} />
        ))}
      </ul>
    </div>
  );
}
