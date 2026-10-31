import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Pager } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrActivity, BLOCKLIST_PAGE, blocklistTitle, type BlocklistItem } from "@/api/arrActivity";
import { useLibraryTitles } from "@/hooks/useLibraryTitles";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

type Pending = { kind: "one"; item: BlocklistItem } | { kind: "selected" } | { kind: "clear" } | null;

/** Releases bloqueadas de Radarr/Sonarr: quitar una, varias o vaciar la lista. */
export function Blocklist({ service }: { service: ArrService }) {
  const qc = useQueryClient();
  const api = arrActivity(service);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const q = useServiceQuery(service, ["blocklist", page], () => api.getBlocklist(page), { keepPrevious: true });
  const titles = useLibraryTitles(service);
  const records = q.data?.records ?? [];
  const total = q.data?.totalRecords ?? 0;
  // Al quitar las últimas de la última página, volver a la que ahora es la última.
  const pages = Math.max(1, Math.ceil(total / BLOCKLIST_PAGE));
  useEffect(() => {
    if (q.data && !q.isPlaceholderData && page > pages) setPage(pages);
  }, [q.data, q.isPlaceholderData, page, pages]);

  const refresh = () => qc.invalidateQueries({ queryKey: [service, "blocklist"] });
  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e, service));
    }
  }
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOnPage = records.length > 0 && records.every((r) => selected.has(r.id));

  if (q.isLoading || q.configured === undefined) return <Loading />;
  if (q.isError) return <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.blocklist.hint}</p>
      {!total ? (
        <Empty>{t.blocklist.empty}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allOnPage}
                onChange={(e) => setSelected(e.target.checked ? new Set(records.map((r) => r.id)) : new Set())}
              />
              {t.blocklist.selectAll}
            </label>
            <span className="text-sm text-muted">{t.blocklist.count(total)}</span>
            <div className="ml-auto flex gap-2">
              {selected.size > 0 && (
                <button className="btn-outline" onClick={() => setPending({ kind: "selected" })}>
                  <XCircle className="h-4 w-4" aria-hidden /> {t.blocklist.removeSelected(selected.size)}
                </button>
              )}
              <button className="btn-ghost text-danger" onClick={() => setPending({ kind: "clear" })}>
                <Trash2 className="h-4 w-4" aria-hidden /> {t.blocklist.clear}
              </button>
            </div>
          </div>
          <ul className="card divide-y divide-border" aria-label={t.activity.blocklist}>
            {records.map((r) => {
              const what = blocklistTitle(r, titles);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={t.common.select(r.sourceTitle)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" title={what}>
                      {what}
                    </div>
                    <div className="truncate font-mono text-xs text-muted" title={r.sourceTitle}>
                      {r.sourceTitle}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      {r.quality?.quality?.name && <span>{r.quality.quality.name}</span>}
                      {r.indexer && <span>{r.indexer}</span>}
                      {r.protocol && r.protocol !== "unknown" && <span>{r.protocol}</span>}
                      <span>{formatDateTime(r.date)}</span>
                    </div>
                    {r.message && <div className="mt-0.5 line-clamp-2 text-xs text-warning">{r.message}</div>}
                  </div>
                  <button
                    className="btn-ghost p-1.5 text-muted hover:text-danger"
                    title={t.blocklist.remove}
                    aria-label={`${t.blocklist.remove}: ${r.sourceTitle}`}
                    onClick={() => setPending({ kind: "one", item: r })}
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={BLOCKLIST_PAGE} total={total} onPage={(p) => (setPage(p), setSelected(new Set()))} />
        </>
      )}
      <ConfirmDialog
        open={pending?.kind === "one"}
        onOpenChange={(o) => !o && setPending(null)}
        title={t.blocklist.removeTitle}
        message={pending?.kind === "one" ? t.blocklist.removeMessage(pending.item.sourceTitle) : ""}
        confirmLabel={t.blocklist.remove}
        onConfirm={() => pending?.kind === "one" && run(() => api.removeBlocklist(pending.item.id), t.blocklist.removed)}
      />
      <ConfirmDialog
        open={pending?.kind === "selected"}
        onOpenChange={(o) => !o && setPending(null)}
        title={t.blocklist.removeSelectedTitle(selected.size)}
        message={t.blocklist.removeSelectedMessage}
        confirmLabel={t.blocklist.removeSelected(selected.size)}
        onConfirm={() => {
          const ids = [...selected];
          run(() => api.removeBlocklistBulk(ids), t.blocklist.removedMany(ids.length));
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "clear"}
        onOpenChange={(o) => !o && setPending(null)}
        title={t.blocklist.clearTitle}
        message={t.blocklist.clearMessage}
        confirmLabel={t.blocklist.clear}
        onConfirm={() =>
          run(async () => {
            await api.clearBlocklist();
            setPage(1);
          }, t.blocklist.cleared)
        }
      />
    </div>
  );
}
