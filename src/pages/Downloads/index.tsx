import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Gauge, Pause, Play, Plus, RotateCw, Tag, Trash2, Turtle, Zap } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { ConfirmDialog } from "@/components/Dialog";
import { Empty, Loading, Segmented } from "@/components/ui";
import { t } from "@/i18n/es";
import { qbit, torrentGroup, type Torrent, type TorrentGroup } from "@/api/qbit";
import { useCategories, useServerState, useTorrents } from "@/hooks/useTorrents";
import { errorMessage } from "@/lib/errors";
import { formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/hooks/usePrefs";
import { usePersistedSort } from "@/hooks/usePersistedSort";
import { AddTorrentDialog } from "./AddTorrentDialog";
import { CategoryDialog, LimitsDialog } from "./BulkDialogs";
import { TorrentDetail } from "./TorrentDetail";
import { ColumnPicker } from "./ColumnPicker";
import {
  columnDefs,
  DEFAULT_DOWNLOAD_SORT,
  firstDir,
  isDownloadSort,
  sortTorrents,
  visibleColumns,
  type DownloadColumn,
  type DownloadSort,
  type SortKey,
} from "./columns";

type Filter = "all" | TorrentGroup;

const groupStyle: Record<TorrentGroup, string> = {
  downloading: "bg-accent/15 text-accent",
  seeding: "bg-success/15 text-success",
  paused: "bg-surface-2 text-muted",
  completed: "bg-success/15 text-success",
  error: "bg-danger/15 text-danger",
};

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button className={cn("btn-ghost p-1.5", danger && "hover:text-danger")} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  children,
}: {
  label: string;
  sortKey: SortKey;
  sort: DownloadSort;
  onSort: (k: SortKey) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const active = sort.key === sortKey;
  const Icon = sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={cn("px-3 py-2 font-medium", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={cn("inline-flex items-center gap-1 whitespace-nowrap hover:text-fg", active && "text-fg")}
        onClick={() => onSort(sortKey)}
        title={t.downloads.sortBy(label)}
        aria-label={t.downloads.sortBy(label)}
      >
        {children ?? label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-accent" : "invisible")} aria-hidden />
      </button>
    </th>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof ArrowDown; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <Icon className="h-5 w-5 text-muted" aria-hidden />
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  const qc = useQueryClient();
  const torrents = useTorrents();
  const server = useServerState();
  const categories = useCategories();
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>("__all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<string[] | null>(null);
  const [detailHash, setDetailHash] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ kind: "category" | "limits"; hashes: string[] } | null>(null);
  const [prefs, setPrefs] = usePrefs();
  const columns = visibleColumns(prefs.downloadColumns);
  const [sort, setSort] = usePersistedSort<DownloadSort>("downloads", DEFAULT_DOWNLOAD_SORT, isDownloadSort);
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir(key) }));

  const list = useMemo(() => {
    const filtered = (torrents.data ?? []).filter(
      (tr) => (filter === "all" || torrentGroup(tr) === filter) && (category === "__all" || tr.category === category),
    );
    return sortTorrents(filtered, sort);
  }, [torrents.data, filter, category, sort]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["qbittorrent"] });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (torrents.configured === false)
    return (
      <Page title={t.nav.downloads}>
        <NotConfigured service="qbittorrent" />
      </Page>
    );

  const sel = [...selected].filter((h) => list.some((tr) => tr.hash === h));
  const allSelected = list.length > 0 && sel.length === list.length;
  const toggle = (hash: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(hash) ? n.delete(hash) : n.add(hash);
      return n;
    });
  const totalDl = (torrents.data ?? []).reduce((a, x) => a + x.dlspeed, 0);
  const totalUp = (torrents.data ?? []).reduce((a, x) => a + x.upspeed, 0);
  const alt = !!server.data?.use_alt_speed_limits;

  return (
    <Page
      title={t.nav.downloads}
      actions={
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> {t.downloads.add}
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={ArrowDown} label={t.downloads.dlSpeed} value={formatSpeed(totalDl)} />
        <Stat icon={ArrowUp} label={t.downloads.upSpeed} value={formatSpeed(totalUp)} />
        <button
          className={cn(
            "card flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
            alt && "border-warning/50",
          )}
          onClick={() => run(qbit.toggleAltSpeed)}
          aria-pressed={alt}
        >
          <Turtle className={cn("h-5 w-5", alt ? "text-warning" : "text-muted")} aria-hidden />
          <div>
            <div className="text-xs text-muted">{t.downloads.altSpeed}</div>
            <div className="font-semibold">{alt ? "On" : "Off"}</div>
          </div>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          label={t.nav.downloads}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t.downloads.all },
            { value: "downloading", label: t.downloads.downloading },
            { value: "seeding", label: t.downloads.seeding },
            { value: "paused", label: t.downloads.paused },
            { value: "completed", label: t.downloads.completed },
            { value: "error", label: t.downloads.error },
          ]}
        />
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t.downloads.category}>
          <option value="__all">{t.downloads.allCategories}</option>
          <option value="">{t.downloads.noCategory}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {sel.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
              <span className="px-2 text-sm text-muted">{t.downloads.selected(sel.length)}</span>
              <IconButton label={t.downloads.resume} onClick={() => run(() => qbit.resume(sel))}>
                <Play className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.downloads.pause} onClick={() => run(() => qbit.pause(sel))}>
                <Pause className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.downloads.forceStart} onClick={() => run(() => qbit.forceStart(sel))}>
                <Zap className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.downloads.recheck} onClick={() => run(() => qbit.recheck(sel))}>
                <RotateCw className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.downloads.setCategory} onClick={() => setBulk({ kind: "category", hashes: sel })}>
                <Tag className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.downloads.setLimits} onClick={() => setBulk({ kind: "limits", hashes: sel })}>
                <Gauge className="h-4 w-4" />
              </IconButton>
              <IconButton label={t.common.delete} danger onClick={() => setToDelete(sel)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          <ColumnPicker value={columns} onChange={(cols) => setPrefs({ downloadColumns: cols })} />
        </div>
      </div>

      {torrents.isLoading || torrents.configured === undefined ? (
        <Loading />
      ) : torrents.isError ? (
        <ErrorPanel service="qbittorrent" error={torrents.error} onRetry={() => torrents.refetch()} />
      ) : list.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={t.downloads.selectAll}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((x) => x.hash)))}
                  />
                </th>
                <SortHeader label={t.downloads.name} sortKey="name" sort={sort} onSort={onSort} />
                {columns.map((c) => (
                  <SortHeader key={c} label={columnDefs[c].label} sortKey={c} sort={sort} onSort={onSort} className={columnDefs[c].width}>
                    {columnDefs[c].header}
                  </SortHeader>
                ))}
                <th className="w-36 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((tr) => (
                <TorrentRow
                  key={tr.hash}
                  tr={tr}
                  columns={columns}
                  selected={selected.has(tr.hash)}
                  onToggle={() => toggle(tr.hash)}
                  run={run}
                  onDelete={() => setToDelete([tr.hash])}
                  onOpen={() => setDetailHash(tr.hash)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TorrentDetail
        torrent={torrents.data?.find((x) => x.hash === detailHash) ?? null}
        onClose={() => setDetailHash(null)}
        onCategory={() => detailHash && setBulk({ kind: "category", hashes: [detailHash] })}
        onLimits={() => detailHash && setBulk({ kind: "limits", hashes: [detailHash] })}
      />
      {bulk?.kind === "category" && (
        <CategoryDialog
          torrents={(torrents.data ?? []).filter((x) => bulk.hashes.includes(x.hash))}
          categories={categories.data ?? []}
          onDone={refresh}
          onClose={() => setBulk(null)}
        />
      )}
      {bulk?.kind === "limits" && (
        <LimitsDialog
          torrents={(torrents.data ?? []).filter((x) => bulk.hashes.includes(x.hash))}
          onDone={refresh}
          onClose={() => setBulk(null)}
        />
      )}
      <AddTorrentDialog open={adding} onOpenChange={setAdding} categories={categories.data ?? []} onAdded={refresh} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.downloads.deleteTitle(toDelete?.length ?? 1)}
        message={t.downloads.deleteMessage}
        checkboxLabel={t.common.deleteFiles}
        onConfirm={(deleteFiles) => {
          const hashes = toDelete ?? [];
          setSelected(new Set());
          run(() => qbit.remove(hashes, deleteFiles));
        }}
      />
    </Page>
  );
}

function TorrentRow({
  tr,
  columns,
  selected,
  onToggle,
  run,
  onDelete,
  onOpen,
}: {
  tr: Torrent;
  columns: DownloadColumn[];
  selected: boolean;
  onToggle: () => void;
  run: (fn: () => Promise<unknown>) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const group = torrentGroup(tr);
  const paused = group === "paused" || (group === "completed" && tr.state.startsWith("p")) || tr.state.startsWith("stopped");
  return (
    <tr className={cn("border-b border-border last:border-0 hover:bg-surface-2/60", selected && "bg-accent/5")}>
      <td className="px-3 py-2.5">
        <input type="checkbox" aria-label={t.downloads.select(tr.name)} checked={selected} onChange={onToggle} />
      </td>
      <td className="min-w-[16rem] max-w-0 px-3 py-2.5">
        <button
          className="block w-full truncate text-left font-medium hover:text-accent"
          title={tr.name}
          aria-label={t.downloads.details(tr.name)}
          onClick={onOpen}
        >
          {tr.name}
        </button>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span className={cn("chip", groupStyle[group])}>{t.downloads.state[group]}</span>
          {tr.category && !columns.includes("category") && <span>{tr.category}</span>}
          {((tr.dl_limit ?? 0) > 0 || (tr.up_limit ?? 0) > 0) && (
            <span className="flex items-center gap-0.5" title={t.downloads.setLimits}>
              <Gauge className="h-3 w-3" />
              {(tr.dl_limit ?? 0) > 0 && <span>↓{formatSpeed(tr.dl_limit)}</span>}
              {(tr.up_limit ?? 0) > 0 && <span>↑{formatSpeed(tr.up_limit)}</span>}
            </span>
          )}
          {!columns.includes("peers") && (
            <span>
              {t.downloads.seeds}: {tr.num_seeds}
            </span>
          )}
        </div>
        {group === "error" && tr.error && (
          <div className="mt-0.5 truncate text-xs text-danger" title={tr.error}>
            {tr.error}
          </div>
        )}
      </td>
      {columns.map((c) => (
        <td key={c} className={cn("max-w-0 px-3 py-2.5", columnDefs[c].width, columnDefs[c].className)}>
          {columnDefs[c].cell(tr)}
        </td>
      ))}
      <td className="px-3 py-2.5">
        <div className="flex justify-end gap-0.5">
          {paused ? (
            <IconButton label={t.downloads.resume} onClick={() => run(() => qbit.resume([tr.hash]))}>
              <Play className="h-4 w-4" />
            </IconButton>
          ) : (
            <IconButton label={t.downloads.pause} onClick={() => run(() => qbit.pause([tr.hash]))}>
              <Pause className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton label={t.downloads.forceStart} onClick={() => run(() => qbit.forceStart([tr.hash]))}>
            <Zap className="h-4 w-4" />
          </IconButton>
          <IconButton label={t.common.delete} danger onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}
