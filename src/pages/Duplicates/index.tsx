import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clapperboard, HardDrive, Hourglass, RefreshCw, Trash2, Tv, CopyMinus } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { ConfirmDialog } from "@/components/Dialog";
import { Empty, Loading, Segmented } from "@/components/ui";
import { t } from "@/i18n/es";
import { qbit } from "@/api/qbit";
import {
  arrDownloadHistory,
  findDuplicates,
  trackerHost,
  type DuplicateGroup,
  type DuplicateRole,
  type DuplicateTorrent,
} from "@/api/duplicates";
import { useIsConfigured } from "@/hooks/useSettings";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";

type Filter = "all" | "radarr" | "sonarr";

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

const roleStyle: Record<DuplicateRole, string> = {
  current: "bg-success/15 text-success",
  leftover: "bg-warning/15 text-warning",
  pending: "bg-surface-2 text-muted",
};

/** Torrents de qBittorrent + historial de Radarr y Sonarr, cruzados. Si un *arr falla se enseña lo del otro. */
function useDuplicates() {
  const qbitOn = useIsConfigured("qbittorrent");
  const radarrOn = useIsConfigured("radarr");
  const sonarrOn = useIsConfigured("sonarr");
  const q = useQuery({
    queryKey: ["qbittorrent", "duplicates", radarrOn, sonarrOn],
    enabled: qbitOn === true && (radarrOn === true || sonarrOn === true),
    staleTime: 60_000,
    queryFn: async () => {
      const torrents = await qbit.getTorrents();
      const services = (["radarr", "sonarr"] as const).filter((s) => (s === "radarr" ? radarrOn : sonarrOn));
      const results = await Promise.allSettled(services.map((s) => arrDownloadHistory(s, torrents)));
      const history = services.flatMap((service, i) => {
        const r = results[i];
        return r.status === "fulfilled" ? [{ service, records: r.value }] : [];
      });
      const failed = services.filter((_, i) => results[i].status === "rejected");
      return { groups: findDuplicates(torrents, history), failed };
    },
  });
  return { ...q, qbitOn, arrOn: radarrOn === true || sonarrOn === true, arrKnown: radarrOn !== undefined && sonarrOn !== undefined };
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3" title={hint}>
      <Icon className={cn("h-5 w-5 text-muted", tone)} aria-hidden />
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className={cn("font-semibold tabular-nums", tone)}>{value}</div>
      </div>
    </div>
  );
}

export default function DuplicatesPage() {
  const qc = useQueryClient();
  const dup = useDuplicates();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<DuplicateTorrent[] | null>(null);

  const groups = useMemo(() => (dup.data?.groups ?? []).filter((g) => filter === "all" || g.service === filter), [dup.data, filter]);
  const leftovers = useMemo(() => groups.flatMap((g) => g.items.filter((i) => i.role === "leftover")), [groups]);
  const totalSize = leftovers.reduce((s, i) => s + i.torrent.size, 0);
  const notMet = leftovers.filter((i) => i.seedGoal && !i.seedGoal.met).length;
  const sel = leftovers.filter((i) => selected.has(i.torrent.hash));
  const selSize = sel.reduce((s, i) => s + i.torrent.size, 0);

  const toggle = (hash: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(hash) ? n.delete(hash) : n.add(hash);
      return n;
    });

  const remove = async (items: DuplicateTorrent[]) => {
    const hashes = items.map((i) => i.torrent.hash);
    try {
      await qbit.remove(hashes, true);
      toast.success(t.duplicates.deleted(hashes.length));
      setSelected((s) => new Set([...s].filter((h) => !hashes.includes(h))));
    } catch (e) {
      toast.error(errorMessage(e));
    }
    qc.invalidateQueries({ queryKey: ["qbittorrent"] });
  };

  const title = t.duplicates.title;
  if (dup.qbitOn === false)
    return (
      <Page title={title}>
        <NotConfigured service="qbittorrent" />
      </Page>
    );

  const deleting = toDelete ?? [];
  const deletingNotMet = deleting.filter((i) => i.seedGoal && !i.seedGoal.met).length;

  return (
    <Page
      title={title}
      actions={
        <button className="btn-ghost" onClick={() => dup.refetch()} disabled={dup.isFetching}>
          <RefreshCw className={cn("h-4 w-4", dup.isFetching && "animate-spin")} /> {t.duplicates.refresh}
        </button>
      }
    >
      <p className="max-w-3xl text-sm text-muted">{t.duplicates.hint}</p>

      {dup.arrKnown && !dup.arrOn ? (
        <Empty>{t.duplicates.needsArr}</Empty>
      ) : dup.isLoading || dup.qbitOn === undefined ? (
        <Loading />
      ) : dup.isError ? (
        <ErrorPanel service="qbittorrent" error={dup.error} onRetry={() => dup.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={CopyMinus} label={t.duplicates.leftovers} value={String(leftovers.length)} />
            <Stat icon={HardDrive} label={t.duplicates.space} value={formatBytes(totalSize)} />
            <Stat
              icon={Hourglass}
              label={t.duplicates.stillSeeding}
              value={String(notMet)}
              hint={t.duplicates.stillSeedingHint}
              tone={notMet > 0 ? "text-warning" : undefined}
            />
          </div>

          {dup.data?.failed.map((s) => (
            <div key={s} className="card border-warning/40 px-4 py-2 text-sm text-warning">
              {t.duplicates.partial(t.services[s])}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Filter>
              label={t.duplicates.title}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t.duplicates.all },
                { value: "radarr", label: t.duplicates.movies },
                { value: "sonarr", label: t.duplicates.series },
              ]}
            />
            {leftovers.length > 0 && (
              <>
                <button
                  className="btn-ghost text-sm"
                  onClick={() => setSelected(new Set(leftovers.filter((i) => !i.seedGoal || i.seedGoal.met).map((i) => i.torrent.hash)))}
                >
                  {t.duplicates.selectReady}
                </button>
                <button className="btn-ghost text-sm" onClick={() => setSelected(new Set(leftovers.map((i) => i.torrent.hash)))}>
                  {t.duplicates.selectAllLeftovers}
                </button>
              </>
            )}
            {sel.length > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-surface py-1 pl-3 pr-1">
                <span className="text-sm text-muted">{t.duplicates.selected(sel.length, formatBytes(selSize))}</span>
                <button className="btn-danger py-1 text-sm" onClick={() => setToDelete(sel)}>
                  <Trash2 className="h-4 w-4" /> {t.duplicates.deleteSelected}
                </button>
              </div>
            )}
          </div>

          {groups.length === 0 ? (
            <Empty>{(dup.data?.groups.length ?? 0) === 0 ? t.duplicates.none : t.duplicates.noneFilter}</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <GroupCard key={g.key} group={g} selected={selected} onToggle={toggle} onDelete={(i) => setToDelete([i])} />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.duplicates.deleteTitle(deleting.length)}
        message={
          <div className="flex flex-col gap-2">
            <p>{t.duplicates.deleteMessage(formatBytes(deleting.reduce((s, i) => s + i.torrent.size, 0)))}</p>
            {deletingNotMet > 0 && <p className="text-warning">{t.duplicates.deleteWarning(deletingNotMet)}</p>}
          </div>
        }
        onConfirm={() => void remove(deleting)}
      />
    </Page>
  );
}

function GroupCard({
  group,
  selected,
  onToggle,
  onDelete,
}: {
  group: DuplicateGroup;
  selected: Set<string>;
  onToggle: (hash: string) => void;
  onDelete: (i: DuplicateTorrent) => void;
}) {
  const Icon = group.service === "radarr" ? Clapperboard : Tv;
  return (
    <section className="card overflow-hidden" aria-label={group.title}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon className={cn("h-4 w-4", group.service === "radarr" ? "text-radarr" : "text-sonarr")} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{group.title}</h2>
        <span className="text-sm tabular-nums text-muted">{t.duplicates.frees(formatBytes(group.leftoverSize))}</span>
      </header>
      <ul>
        {group.items.map((i) => (
          <TorrentLine
            key={i.torrent.hash}
            item={i}
            selected={selected.has(i.torrent.hash)}
            onToggle={() => onToggle(i.torrent.hash)}
            onDelete={() => onDelete(i)}
          />
        ))}
      </ul>
    </section>
  );
}

function SeedGoalChip({ item }: { item: DuplicateTorrent }) {
  const g = item.seedGoal;
  if (!g) return null;
  const parts = [g.ratio != null && `ratio ${nf.format(g.ratio)}`, g.minutes != null && formatDuration(g.minutes * 60)]
    .filter(Boolean)
    .join(" o ");
  const label = g.met
    ? t.duplicates.goalMet
    : g.remainingSecs != null
      ? t.duplicates.goalLeft(formatDuration(g.remainingSecs))
      : t.duplicates.goalRatio(nf.format(g.ratio ?? 0));
  return (
    <span
      className={cn("chip whitespace-nowrap", g.met ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}
      title={t.duplicates.goalTitle(parts)}
    >
      {label}
    </span>
  );
}

function TorrentLine({
  item,
  selected,
  onToggle,
  onDelete,
}: {
  item: DuplicateTorrent;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const tr = item.torrent;
  const leftover = item.role === "leftover";
  const source = item.indexer ?? trackerHost(tr.tracker);
  const when = item.importedAt
    ? t.duplicates.imported(formatDate(item.importedAt))
    : item.grabbedAt
      ? t.duplicates.grabbed(formatDate(item.grabbedAt))
      : undefined;
  const meta = [item.episodes, item.quality, source, when].filter(Boolean);
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-2 last:border-0",
        !leftover && "bg-surface-2/40",
        selected && "bg-accent/5",
      )}
    >
      <div className="w-4 shrink-0">
        {leftover && <input type="checkbox" aria-label={t.downloads.select(tr.name)} checked={selected} onChange={onToggle} />}
      </div>
      <span className={cn("chip w-24 shrink-0 justify-center", roleStyle[item.role])} title={t.duplicates.roleHint[item.role]}>
        {t.duplicates.role[item.role]}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", leftover ? "font-medium" : "text-muted")} title={tr.name}>
          {tr.name}
        </div>
        <div className="truncate text-xs text-muted">{meta.join(" · ")}</div>
      </div>
      <div className="w-20 shrink-0 text-right text-sm tabular-nums" title={t.duplicates.size}>
        {formatBytes(tr.size)}
      </div>
      <div className="w-14 shrink-0 text-right text-sm tabular-nums" title={t.duplicates.ratio}>
        {tr.ratio >= 0 ? nf.format(tr.ratio) : "∞"}
      </div>
      <div className="w-16 shrink-0 text-right text-sm tabular-nums text-muted" title={t.duplicates.seeded}>
        {tr.progress >= 1 ? formatDuration(tr.seeding_time) : "—"}
      </div>
      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums text-muted" title={t.duplicates.peers}>
        <span className="flex items-center">
          <ArrowUp className="h-3 w-3 text-success" aria-hidden />
          {tr.num_complete ?? tr.num_seeds}
        </span>
        <span className="flex items-center">
          <ArrowDown className="h-3 w-3 text-accent" aria-hidden />
          {tr.num_incomplete ?? tr.num_leechs}
        </span>
      </div>
      <div className="flex w-28 shrink-0 justify-end">
        <SeedGoalChip item={item} />
      </div>
      <div className="w-8 shrink-0">
        {leftover && (
          <button
            className="btn-ghost p-1.5 hover:text-danger"
            onClick={onDelete}
            aria-label={t.duplicates.deleteOne(tr.name)}
            title={t.common.delete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}
