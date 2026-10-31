import { useMemo, useState } from "react";
import { RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Toggle } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrManage, exclusionLabel, isImportListEnabled, type ImportExclusion, type ImportList } from "@/api/arrManage";
import { useExclusions, useImportLists, useRun } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

export function ImportLists({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useImportLists(service);
  const run = useRun(service);
  const [deleting, setDeleting] = useState<ImportList | null>(null);
  const list = [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const keys = [[service, "importlists"]];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t.manage.lists.hint}</p>
        <button className="btn-outline" disabled={!list.length} onClick={() => run(api.syncImportLists, t.manage.lists.syncStarted, [])}>
          <RefreshCw className="h-4 w-4" aria-hidden /> {t.manage.lists.sync}
        </button>
      </div>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty>{t.manage.lists.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.lists}>
          {list.map((l) => {
            const on = isImportListEnabled(service, l);
            return (
              <li key={l.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <Toggle
                  checked={on}
                  label={on ? t.manage.lists.disable(l.name) : t.manage.lists.enable(l.name)}
                  onChange={(v) => run(() => api.setImportListEnabled(l, v), t.manage.lists.toggled(l.name, v), keys)}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", !on && "text-muted")}>{l.name}</div>
                  <div className="text-xs text-muted">
                    {[l.implementationName ?? l.implementation, !on && t.manage.lists.off].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button
                  className="btn-ghost p-1.5 text-muted hover:text-danger"
                  aria-label={`${t.common.delete}: ${l.name}`}
                  title={t.common.delete}
                  onClick={() => setDeleting(l)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.lists.deleteTitle}
        message={deleting ? t.manage.lists.deleteMessage(deleting.name) : ""}
        onConfirm={() => deleting && run(() => api.deleteImportList(deleting.id), t.manage.lists.deleted, keys)}
      />
    </div>
  );
}

const STEP = 200;
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Exclusions({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useExclusions(service);
  const run = useRun(service);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(STEP);
  const [deleting, setDeleting] = useState<ImportExclusion | null>(null);
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => exclusionLabel(a).localeCompare(exclusionLabel(b))), [q.data]);
  const filtered = useMemo(() => {
    const n = normalize(query.trim());
    return n ? all.filter((e) => normalize(exclusionLabel(e)).includes(n)) : all;
  }, [all, query]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.manage.exclusions.hint}</p>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !all.length ? (
        <Empty>{t.manage.exclusions.empty}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input pl-9"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(STEP);
                }}
                placeholder={t.manage.exclusions.filter}
                aria-label={t.manage.exclusions.filter}
              />
            </div>
            <span className="text-sm text-muted">{t.manage.exclusions.count(filtered.length)}</span>
          </div>
          {!filtered.length ? (
            <Empty>{t.manage.exclusions.noMatch}</Empty>
          ) : (
            <ul className="card divide-y divide-border" aria-label={t.manage.tabs.exclusions}>
              {filtered.slice(0, shown).map((e) => {
                const what = exclusionLabel(e);
                const ext = e.tmdbId ? `TMDb ${e.tmdbId}` : e.tvdbId ? `TVDB ${e.tvdbId}` : "";
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{what}</span>
                    {ext && <span className="text-xs text-muted">{ext}</span>}
                    <button
                      className="btn-ghost p-1.5 text-muted hover:text-danger"
                      aria-label={`${t.manage.exclusions.remove}: ${what}`}
                      title={t.manage.exclusions.remove}
                      onClick={() => setDeleting(e)}
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > shown && (
            <button className="btn-outline self-center" onClick={() => setShown((s) => s + STEP)}>
              {t.manage.exclusions.showMore(Math.min(STEP, filtered.length - shown))}
            </button>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.exclusions.removeTitle}
        message={deleting ? t.manage.exclusions.removeMessage(exclusionLabel(deleting)) : ""}
        confirmLabel={t.manage.exclusions.remove}
        onConfirm={() => deleting && run(() => api.deleteExclusion(deleting.id), t.manage.exclusions.removed, [[service, "exclusions"]])}
      />
    </div>
  );
}
