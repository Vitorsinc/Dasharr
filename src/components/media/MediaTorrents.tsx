import type { UseQueryResult } from "@tanstack/react-query";
import { Clock } from "lucide-react";
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

function TorrentCard({ tr, picked, locked, onPick }: { tr: Torrent; picked?: boolean; locked?: boolean; onPick?: (on: boolean) => void }) {
  const host = trackerHost(tr.tracker);
  const body = (
    <div className="min-w-0 flex-1">
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
        <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums" title={`${t.library.seedTime} · ${t.downloads.state[torrentGroup(tr)]}`}>
          <Clock className="h-3 w-3 text-muted" aria-hidden />
          {formatDuration(tr.seeding_time)}
        </span>
        <Fact label="R" value={ratio(tr.ratio)} title={`${t.torrent.ratio} · ${t.torrent.uploaded}: ${formatBytes(tr.uploaded)}`} />
        <Fact label="S" value={swarm(tr.num_seeds, tr.num_complete)} title={`${t.torrent.seeds} · ${t.library.swarmHint}`} />
        <Fact label="L" value={swarm(tr.num_leechs, tr.num_incomplete)} title={`${t.library.leechers} · ${t.library.swarmHint}`} />
      </div>
    </div>
  );
  if (!onPick) return <li className="rounded-md border border-border px-2.5 py-1.5">{body}</li>;
  return (
    <li>
      <label
        className={
          "flex items-start gap-2 rounded-md border px-2.5 py-1.5 " +
          (locked ? "cursor-not-allowed " : "cursor-pointer ") +
          (picked || locked ? "border-danger/60 bg-danger/5" : "border-border")
        }
      >
        <input
          type="checkbox"
          className="mt-1 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--danger))]"
          checked={locked || !!picked}
          disabled={locked}
          onChange={(e) => onPick(e.target.checked)}
          aria-label={tr.name}
        />
        {body}
      </label>
    </li>
  );
}

/**
 * Los torrents de qBittorrent de lo que se borra, con lo importante para decidir (tracker, ratio, tiempo sembrado…).
 * Con `picked`/`onPick` cada uno lleva su casilla para elegir cuáles quitar; `locked` (se quitan todos) las deja
 * marcadas y bloqueadas.
 */
export function MediaTorrents({
  q,
  picked,
  locked,
  onPick,
}: {
  q: UseQueryResult<Torrent[]>;
  picked?: Set<string>;
  locked?: boolean;
  onPick?: (hash: string, on: boolean) => void;
}) {
  if (q.isPending) return <p className="text-xs text-muted">{t.library.torrentsLooking}</p>;
  if (q.isError) return <p className="text-xs text-warning">{t.library.torrentsLookupFailed}</p>;
  if (q.data.length === 0) return <p className="text-xs text-muted">{t.library.torrentsNone}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs text-muted">{t.library.torrentsFound(q.data.length)}</div>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {q.data.map((tr) => (
          <TorrentCard key={tr.hash} tr={tr} picked={picked?.has(tr.hash)} locked={locked} onPick={onPick && ((on) => onPick(tr.hash, on))} />
        ))}
      </ul>
    </div>
  );
}
