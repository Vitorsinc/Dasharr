import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Spinner } from "@/components/ui";
import { getReleases, grabRelease, sortReleases, type ArrService, type Release, type ReleaseQuery, type ReleaseSort } from "@/api/arr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

function age(r: Release) {
  const h = r.ageHours ?? (r.age != null ? r.age * 24 : undefined);
  if (h == null) return "—";
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
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
  const [sort, setSort] = useState<ReleaseSort>("default");
  const [showRejected, setShowRejected] = useState(true);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Release | null>(null);
  const list = useMemo(
    () =>
      sortReleases(
        (releases.data ?? []).filter((r) => showRejected || !r.rejected),
        sort,
      ),
    [releases.data, sort, showRejected],
  );

  async function grab(r: Release) {
    setGrabbing(r.guid);
    try {
      await grabRelease(service, r);
      toast.success(t.releases.grabbed, { description: r.title });
      void qc.invalidateQueries({ queryKey: [service, "queue"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGrabbing(null);
    }
  }

  if (!query) return null;
  const accepted = (releases.data ?? []).filter((r) => !r.rejected).length;
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={t.releases.title(what)} wide>
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
              <select
                className="input ml-auto w-auto"
                value={sort}
                onChange={(e) => setSort(e.target.value as ReleaseSort)}
                aria-label="Ordenar releases"
              >
                <option value="default">{t.releases.sortDefault}</option>
                <option value="score">{t.releases.score}</option>
                <option value="seeders">{t.search.seeders}</option>
                <option value="size">{t.search.size}</option>
                <option value="age">{t.search.age}</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-2/50 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t.search.title}</th>
                    <th className="w-28 px-2 py-2 font-medium">{t.releases.quality}</th>
                    <th className="w-20 px-2 py-2 font-medium">{t.search.size}</th>
                    <th className="w-20 px-2 py-2 font-medium">{t.search.seeders}</th>
                    <th className="w-14 px-2 py-2 font-medium">{t.search.age}</th>
                    <th className="w-14 px-2 py-2 font-medium">{t.releases.score}</th>
                    <th className="w-20 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.guid}
                      className={cn("border-b border-border last:border-0 hover:bg-surface-2/60", r.rejected && "text-muted")}
                    >
                      <td className="max-w-0 px-3 py-2">
                        <div className="truncate" title={r.title}>
                          {r.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span>{r.indexer}</span>
                          {r.languages?.length ? <span>{r.languages.map((l) => l.name).join(", ")}</span> : null}
                          {r.rejected && (
                            <span className="chip bg-danger/10 text-danger" title={r.rejections?.join("\n")}>
                              <AlertTriangle className="h-3 w-3" /> {t.releases.rejected}
                            </span>
                          )}
                        </div>
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
