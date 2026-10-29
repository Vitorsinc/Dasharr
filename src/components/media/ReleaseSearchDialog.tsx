import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Spinner } from "@/components/ui";
import { SubtitleBadge } from "./SubtitleBadge";
import {
  filterReleases,
  getReleases,
  grabRelease,
  releaseSortDefaultDir,
  sortReleases,
  type ArrService,
  type Release,
  type ReleaseQuery,
  type ReleaseSort,
  type ReleaseSortKey,
} from "@/api/arr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { isApiError } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

function age(r: Release) {
  const h = r.ageHours ?? (r.age != null ? r.age * 24 : undefined);
  if (h == null) return "—";
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}

/** Cabecera de columna que ordena al pulsarla; vuelve a pulsar para invertir el sentido. */
function SortTh({
  k,
  sort,
  onSort,
  className,
  children,
}: {
  k: ReleaseSortKey;
  sort: ReleaseSort;
  onSort: (k: ReleaseSortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-2 py-0 font-medium", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("group flex items-center gap-1 py-2 hover:text-fg", active && "text-fg")}
      >
        {children}
        <Icon className={cn("h-3 w-3 shrink-0", active ? "text-accent" : "opacity-0 group-hover:opacity-60")} />
      </button>
    </th>
  );
}

/** Búsqueda interactiva como la de Radarr/Sonarr: lista las releases y permite elegir cuál descargar. */
export function ReleaseSearchDialog({
  service,
  query,
  what,
  onClose,
}: {
  service: ArrService;
  query: ReleaseQuery | null;
  what: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const releases = useQuery({
    queryKey: [service, "releases", query],
    queryFn: () => getReleases(service, query!),
    enabled: query !== null,
    staleTime: 60_000,
    retry: false,
  });
  const [sort, setSort] = useState<ReleaseSort>({ key: "default", dir: "asc" });
  const [filter, setFilter] = useState("");
  const [showRejected, setShowRejected] = useState(true);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Release | null>(null);
  const list = useMemo(
    () =>
      sortReleases(
        filterReleases((releases.data ?? []).filter((r) => showRejected || !r.rejected), filter),
        sort,
      ),
    [releases.data, sort, showRejected, filter],
  );
  const onSort = (key: ReleaseSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: releaseSortDefaultDir[key] }));

  async function grab(r: Release) {
    setGrabbing(r.guid);
    try {
      await grabRelease(service, r);
      toast.success(t.releases.grabbed, { description: r.title });
      void qc.invalidateQueries({ queryKey: [service, "queue"] });
    } catch (e) {
      const status = isApiError(e) && e.kind === "Http" ? e.status : undefined;
      toast.error(status === 404 ? t.releases.expired : status === 409 ? t.releases.indexerFailed : errorMessage(e, service));
    } finally {
      setGrabbing(null);
    }
  }

  if (!query) return null;
  const accepted = (releases.data ?? []).filter((r) => !r.rejected).length;
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={t.releases.title(what)} wide="xl">
        {releases.isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted">
            <Spinner className="h-6 w-6" />
            {t.releases.searching}
          </div>
        ) : releases.isError ? (
          <ErrorPanel service={service} error={releases.error} onRetry={() => releases.refetch()} compact />
        ) : !releases.data?.length ? (
          <Empty>{t.releases.none}</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{t.releases.count(releases.data.length, accepted)}</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />
                {t.releases.showRejected}
              </label>
              {list.length !== releases.data.length && <span>{t.releases.filtered(list.length)}</span>}
              {sort.key !== "default" && (
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSort({ key: "default", dir: "asc" })}>
                  <X className="h-3.5 w-3.5" /> {t.releases.sortReset}
                </button>
              )}
              <div className="relative ml-auto w-72">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  className="input py-1.5 pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t.releases.filter}
                  aria-label={t.releases.filter}
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-2/50 text-left text-xs text-muted">
                  <tr>
                    <SortTh k="title" sort={sort} onSort={onSort} className="pl-3">
                      {t.search.title}
                    </SortTh>
                    <SortTh k="indexer" sort={sort} onSort={onSort} className="w-28">
                      {t.releases.indexer}
                    </SortTh>
                    <SortTh k="quality" sort={sort} onSort={onSort} className="w-28">
                      {t.releases.quality}
                    </SortTh>
                    <SortTh k="size" sort={sort} onSort={onSort} className="w-20">
                      {t.search.size}
                    </SortTh>
                    <SortTh k="seeders" sort={sort} onSort={onSort} className="w-20">
                      {t.search.seeders}
                    </SortTh>
                    <SortTh k="age" sort={sort} onSort={onSort} className="w-16">
                      {t.search.age}
                    </SortTh>
                    <SortTh k="score" sort={sort} onSort={onSort} className="w-16">
                      {t.releases.score}
                    </SortTh>
                    <th className="w-20 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted">
                        {t.releases.noMatch}
                      </td>
                    </tr>
                  )}
                  {list.map((r) => (
                    <tr
                      key={r.guid}
                      className={cn("border-b border-border last:border-0 hover:bg-surface-2/60", r.rejected && "text-muted")}
                    >
                      <td className="max-w-0 px-3 py-2">
                        <div className="line-clamp-2 break-all" title={r.title}>
                          {r.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          {r.languages?.length ? <span>{r.languages.map((l) => l.name).join(", ")}</span> : null}
                          <SubtitleBadge title={r.title} infoUrl={r.infoUrl} />
                          {r.rejected && (
                            <span className="chip bg-danger/10 text-danger" title={r.rejections?.join("\n")}>
                              <AlertTriangle className="h-3 w-3" /> {t.releases.rejected}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-0 truncate px-2 py-2 text-xs" title={r.indexer}>
                        {r.indexer}
                      </td>
                      <td className="px-2 py-2 text-xs">{r.quality?.quality?.name ?? "—"}</td>
                      <td className="px-2 py-2 text-xs tabular-nums">{formatBytes(r.size)}</td>
                      <td className="px-2 py-2 text-xs tabular-nums">
                        {r.protocol === "torrent" ? `${r.seeders ?? "—"} / ${r.leechers ?? "—"}` : "Usenet"}
                      </td>
                      <td className="px-2 py-2 text-xs tabular-nums">{age(r)}</td>
                      <td
                        className={cn(
                          "px-2 py-2 text-xs tabular-nums",
                          (r.customFormatScore ?? 0) > 0 ? "text-success" : (r.customFormatScore ?? 0) < 0 ? "text-danger" : "",
                        )}
                      >
                        {r.customFormatScore ?? 0}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-0.5">
                          {r.infoUrl && (
                            <a
                              className="btn-ghost p-1.5"
                              href={r.infoUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Ver en el indexador"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            className="btn-ghost p-1.5 text-accent"
                            disabled={grabbing === r.guid}
                            onClick={() => (r.rejected ? setConfirm(r) : grab(r))}
                            aria-label={`${t.releases.download}: ${r.title}`}
                            title={t.releases.download}
                          >
                            {grabbing === r.guid ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t.releases.confirmRejectedTitle}
        message={t.releases.confirmRejected(confirm?.rejections?.join("; ") ?? "")}
        confirmLabel={t.releases.download}
        onConfirm={() => confirm && grab(confirm)}
      />
    </>
  );
}
