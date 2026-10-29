import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Tag } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, ProgressBar, Segmented } from "@/components/ui";
import { qbit, type Torrent } from "@/api/qbit";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDateTime, formatPercent, formatSpeed } from "@/lib/format";

type Tab = "general" | "files" | "trackers" | "peers";

/** Las listas de la ficha se refrescan cada pocos segundos mientras está abierta. */
const LIVE = 3_000;

const fromUnix = (s: number) => (s > 0 ? formatDateTime(new Date(s * 1000)) : "—");
const limitText = (bytes: number) => (bytes > 0 ? formatSpeed(bytes) : t.downloads.noLimit);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="break-all text-sm">{value}</div>
    </div>
  );
}

function General({ tr }: { tr: Torrent }) {
  const q = useQuery({
    queryKey: ["qbittorrent", "properties", tr.hash],
    queryFn: () => qbit.getProperties(tr.hash),
    refetchInterval: LIVE,
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="qbittorrent" error={q.error} onRetry={() => q.refetch()} compact />;
  const p = q.data!;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <div className="col-span-full">
        <Row label={t.torrent.savePath} value={<span className="font-mono text-xs">{p.save_path}</span>} />
      </div>
      <Row label={t.torrent.added} value={fromUnix(p.addition_date)} />
      <Row label={t.torrent.completed} value={fromUnix(p.completion_date)} />
      <Row label={t.torrent.ratio} value={p.share_ratio?.toFixed(2)} />
      <Row label={t.torrent.downloaded} value={formatBytes(p.total_downloaded)} />
      <Row label={t.torrent.uploaded} value={formatBytes(p.total_uploaded)} />
      <Row label={t.torrent.seeds} value={t.torrent.of(p.seeds, p.seeds_total)} />
      <Row label={t.torrent.peersCount} value={t.torrent.of(p.peers, p.peers_total)} />
      <Row label={t.torrent.dlLimit} value={limitText(p.dl_limit)} />
      <Row label={t.torrent.upLimit} value={limitText(p.up_limit)} />
      {p.is_private != null && <Row label={t.torrent.private} value={p.is_private ? t.torrent.yes : t.torrent.no} />}
      {p.comment && (
        <div className="col-span-full">
          <Row label={t.torrent.comment} value={p.comment} />
        </div>
      )}
    </div>
  );
}

function Files({ tr }: { tr: Torrent }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["qbittorrent", "files", tr.hash], queryFn: () => qbit.getFiles(tr.hash), refetchInterval: LIVE });
  const setPrio = async (indexes: number[], priority: number) => {
    try {
      await qbit.setFilePriority(tr.hash, indexes, priority);
      await qc.invalidateQueries({ queryKey: ["qbittorrent", "files", tr.hash] });
    } catch (e) {
      toast.error(errorMessage(e, "qbittorrent"));
    }
  };
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="qbittorrent" error={q.error} onRetry={() => q.refetch()} compact />;
  const files = q.data ?? [];
  if (!files.length) return <Empty>{t.torrent.noFiles}</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t.torrent.filesHint}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {files.map((f) => (
          <li key={f.index} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              aria-label={`${t.torrent.download}: ${f.name}`}
              checked={f.priority > 0}
              onChange={() => setPrio([f.index], f.priority > 0 ? 0 : 1)}
            />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate", f.priority === 0 && "text-muted line-through")} title={f.name}>
                {f.name}
              </div>
              <ProgressBar value={f.progress} className="mt-1" tone={f.progress >= 1 ? "success" : "accent"} />
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
              {formatPercent(f.progress)} · {formatBytes(f.size)}
            </span>
            <select
              className="input w-28 py-1 text-xs"
              aria-label={`${t.torrent.priority}: ${f.name}`}
              value={[0, 1, 6, 7].includes(f.priority) ? f.priority : 1}
              onChange={(e) => setPrio([f.index], Number(e.target.value))}
            >
              {[0, 1, 6, 7].map((p) => (
                <option key={p} value={p}>
                  {t.torrent.prio[p]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

const trackerTone: Record<number, string> = { 2: "text-success", 4: "text-danger", 5: "text-danger", 6: "text-danger" };

function Trackers({ tr }: { tr: Torrent }) {
  const q = useQuery({ queryKey: ["qbittorrent", "trackers", tr.hash], queryFn: () => qbit.getTrackers(tr.hash), refetchInterval: LIVE });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="qbittorrent" error={q.error} onRetry={() => q.refetch()} compact />;
  // DHT, PeX y LSD aparecen como pseudo-trackers con tier -1.
  const list = (q.data ?? []).filter((x) => x.tier >= 0);
  if (!list.length) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          <th className="py-1 font-medium">{t.torrent.tracker}</th>
          <th className="w-32 py-1 font-medium">{t.torrent.status}</th>
          <th className="w-24 py-1 font-medium">{t.torrent.seeds}</th>
          <th className="w-24 py-1 font-medium">{t.torrent.peersCount}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((x) => (
          <tr key={x.url} className="border-t border-border align-top">
            <td className="max-w-0 py-1.5 pr-3">
              <div className="truncate font-mono text-xs" title={x.url}>
                {x.url}
              </div>
              {x.msg && (
                <div className="truncate text-xs text-muted" title={x.msg}>
                  {x.msg}
                </div>
              )}
            </td>
            <td className={cn("py-1.5", trackerTone[x.status])}>{t.torrent.trackerStatus[x.status] ?? x.status}</td>
            <td className="py-1.5 tabular-nums">{x.num_seeds >= 0 ? x.num_seeds : "—"}</td>
            <td className="py-1.5 tabular-nums">{x.num_leeches >= 0 ? x.num_leeches : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Peers({ tr }: { tr: Torrent }) {
  const q = useQuery({ queryKey: ["qbittorrent", "peers", tr.hash], queryFn: () => qbit.getPeers(tr.hash), refetchInterval: LIVE });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="qbittorrent" error={q.error} onRetry={() => q.refetch()} compact />;
  const list = [...(q.data ?? [])].sort((a, b) => b.dl_speed + b.up_speed - (a.dl_speed + a.up_speed));
  if (!list.length) return <Empty>{t.torrent.noPeers}</Empty>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          <th className="py-1 font-medium">IP</th>
          <th className="py-1 font-medium">{t.torrent.client}</th>
          <th className="w-20 py-1 font-medium">{t.downloads.progress}</th>
          <th className="w-24 py-1 font-medium">{t.downloads.dlSpeed}</th>
          <th className="w-24 py-1 font-medium">{t.downloads.upSpeed}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => (
          <tr key={`${p.ip}:${p.port}`} className="border-t border-border">
            <td className="py-1.5 font-mono text-xs" title={p.country}>
              {p.ip}:{p.port}
            </td>
            <td className="max-w-0 truncate py-1.5 text-xs">{p.client}</td>
            <td className="py-1.5 text-xs tabular-nums">{formatPercent(p.progress)}</td>
            <td className="py-1.5 text-xs tabular-nums">{formatSpeed(p.dl_speed)}</td>
            <td className="py-1.5 text-xs tabular-nums">{formatSpeed(p.up_speed)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ficha de un torrent: datos generales, archivos (elegir cuáles bajar), trackers y pares, como en qBittorrent. */
export function TorrentDetail({
  torrent,
  onClose,
  onCategory,
  onLimits,
}: {
  torrent: Torrent | null;
  onClose: () => void;
  onCategory: () => void;
  onLimits: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  if (!torrent) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={torrent.name} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "general", label: t.torrent.general },
              { value: "files", label: t.torrent.files },
              { value: "trackers", label: t.torrent.trackers },
              { value: "peers", label: t.torrent.peers },
            ]}
          />
          <button className="btn-outline ml-auto" onClick={onCategory}>
            <Tag className="h-4 w-4" /> {t.downloads.setCategory}
          </button>
          <button className="btn-outline" onClick={onLimits}>
            <Gauge className="h-4 w-4" /> {t.downloads.setLimits}
          </button>
        </div>
        {tab === "general" ? (
          <General tr={torrent} />
        ) : tab === "files" ? (
          <Files tr={torrent} />
        ) : tab === "trackers" ? (
          <Trackers tr={torrent} />
        ) : (
          <Peers tr={torrent} />
        )}
      </div>
    </Dialog>
  );
}
