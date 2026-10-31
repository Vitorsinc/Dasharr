import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, FlaskConical, History, Link2, Pencil, Plus, Radar, Trash2, type LucideIcon } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ConfirmDialog } from "@/components/Dialog";
import { TabNav } from "@/components/TabNav";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { HealthList } from "@/components/HealthList";
import { Empty, Loading, Spinner, Toggle } from "@/components/ui";
import { prowlarr, testFailure, type Indexer, type IndexerFull, type IndexerStatus } from "@/api/prowlarr";
import { useRun } from "@/hooks/useArrManage";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useIsConfigured } from "@/hooks/useSettings";
import { IndexerDialog } from "./IndexerDialog";
import { IndexerStats } from "./Stats";
import { ProwlarrHistory } from "./History";
import { ProwlarrApps } from "./Apps";

type State = "ok" | "off" | "failing" | "paused";

export function indexerState(ix: Indexer, st: IndexerStatus | undefined, now = new Date()): State {
  if (!ix.enable) return "off";
  if (st?.disabledTill && new Date(st.disabledTill) > now) return "paused";
  if (st?.mostRecentFailure) return "failing";
  return "ok";
}

const stateStyle: Record<State, string> = {
  ok: "bg-success/15 text-success",
  off: "bg-surface-2 text-muted",
  failing: "bg-warning/15 text-warning",
  paused: "bg-danger/15 text-danger",
};

function stateLabel(state: State, st?: IndexerStatus) {
  if (state === "ok") return t.indexers.statusOk;
  if (state === "off") return t.indexers.statusOff;
  if (state === "paused") return t.indexers.statusPaused(formatDateTime(st?.disabledTill));
  return t.indexers.statusFailing(formatDateTime(st?.initialFailure ?? st?.mostRecentFailure));
}

function IndexerList() {
  const qc = useQueryClient();
  const run = useRun("prowlarr");
  const [dialog, setDialog] = useState<IndexerFull | "new" | null>(null);
  const [deleting, setDeleting] = useState<Indexer | null>(null);
  const indexers = useServiceQuery("prowlarr", ["indexers"], prowlarr.getIndexers, { refetchInterval: REFRESH.status });
  const status = useServiceQuery("prowlarr", ["indexerstatus"], prowlarr.getIndexerStatus, { refetchInterval: REFRESH.status });
  const [testing, setTesting] = useState<Set<number>>(new Set());
  const [failures, setFailures] = useState<Record<number, string>>({});
  const statusById = useMemo(() => new Map((Array.isArray(status.data) ? status.data : []).map((s) => [s.indexerId, s])), [status.data]);
  const list = useMemo(
    () => [...(indexers.data ?? [])].sort((a, b) => Number(b.enable) - Number(a.enable) || a.name.localeCompare(b.name)),
    [indexers.data],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["prowlarr"] });

  /** Prueba uno; devuelve true si funciona. Guarda el motivo para enseñarlo bajo el indexador. */
  async function test(ix: Indexer, quiet = false) {
    setTesting((s) => new Set(s).add(ix.id));
    try {
      await prowlarr.test(ix);
      setFailures(({ [ix.id]: _, ...rest }) => rest);
      if (!quiet) toast.success(t.indexers.testOk(ix.name));
      return true;
    } catch (e) {
      const why = testFailure(e) ?? errorMessage(e, "prowlarr");
      setFailures((f) => ({ ...f, [ix.id]: why }));
      if (!quiet) toast.error(t.indexers.testFailed(ix.name), { description: why });
      return false;
    } finally {
      setTesting((s) => {
        const n = new Set(s);
        n.delete(ix.id);
        return n;
      });
    }
  }

  async function testAll() {
    const enabled = list.filter((x) => x.enable);
    const results = await Promise.all(enabled.map((x) => test(x, true)));
    const failed = results.filter((ok) => !ok).length;
    if (failed) toast.error(t.indexers.testAllFailed(failed));
    else toast.success(t.indexers.testAllOk);
    refresh();
  }

  async function toggle(ix: Indexer) {
    try {
      await prowlarr.setEnabled(ix, !ix.enable);
      toast.success(t.indexers.toggled(ix.name, !ix.enable));
      refresh();
    } catch (e) {
      toast.error(errorMessage(e, "prowlarr"));
    }
  }

  const on = list.filter((x) => x.enable).length;
  const failing = list.filter((x) => ["failing", "paused"].includes(indexerState(x, statusById.get(x.id))) || failures[x.id]).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-outline" disabled={!on || testing.size > 0} onClick={testAll}>
          {testing.size > 0 ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />} {t.indexers.testAll}
        </button>
        <button className="btn-primary" onClick={() => setDialog("new")}>
          <Plus className="h-4 w-4" aria-hidden /> {t.indexers.add}
        </button>
      </div>
      <HealthList services={["prowlarr"]} hideWhenOk />
      {indexers.isLoading || indexers.configured === undefined ? (
        <Loading />
      ) : indexers.isError ? (
        <ErrorPanel service="prowlarr" error={indexers.error} onRetry={() => indexers.refetch()} />
      ) : !list.length ? (
        <Empty>{t.indexers.empty}</Empty>
      ) : (
        <>
          <p className="text-sm text-muted">
            {t.indexers.count(on, list.length)}
            {failing > 0 && <span className="text-warning"> · {t.indexers.failingCount(failing)}</span>}
          </p>
          <div className="card divide-y divide-border">
            {list.map((ix) => {
              const st = statusById.get(ix.id);
              const state = indexerState(ix, st);
              const why = failures[ix.id];
              return (
                <div key={ix.id} className="flex items-center gap-4 px-4 py-3">
                  <Toggle
                    checked={ix.enable}
                    onChange={() => toggle(ix)}
                    label={ix.enable ? t.indexers.disable(ix.name) : t.indexers.enable(ix.name)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-medium", !ix.enable && "text-muted")}>{ix.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={cn("chip", stateStyle[state])} title={state === "paused" ? t.indexers.pausedHint : undefined}>
                        {stateLabel(state, st)}
                      </span>
                      <span>{ix.protocol}</span>
                      {ix.privacy && <span>{t.indexers.privacy[ix.privacy] ?? ix.privacy}</span>}
                    </div>
                    {why && (
                      <div className="mt-1 line-clamp-2 text-xs text-danger" title={why}>
                        {why}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-outline px-2.5 py-1.5"
                    disabled={testing.has(ix.id)}
                    aria-label={`${t.indexers.test}: ${ix.name}`}
                    onClick={async () => {
                      await test(ix);
                      refresh();
                    }}
                  >
                    {testing.has(ix.id) ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} {t.indexers.test}
                  </button>
                  <button className="btn-ghost p-1.5" aria-label={t.indexers.edit(ix.name)} title={t.common.edit} onClick={() => setDialog(ix as IndexerFull)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-muted hover:text-danger"
                    aria-label={`${t.common.delete}: ${ix.name}`}
                    title={t.common.delete}
                    onClick={() => setDeleting(ix)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {dialog && <IndexerDialog indexer={dialog === "new" ? null : dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.indexers.deleteTitle}
        message={deleting ? t.indexers.deleteMessage(deleting.name) : ""}
        onConfirm={() => deleting && run(() => prowlarr.deleteIndexer(deleting.id), t.indexers.deleted(deleting.name), [["prowlarr"]])}
      />
    </div>
  );
}

const tabs: { id: string; label: string; icon: LucideIcon; render: () => ReactNode }[] = [
  { id: "lista", label: t.indexers.tabs.list, icon: Radar, render: () => <IndexerList /> },
  { id: "estadisticas", label: t.indexers.tabs.stats, icon: BarChart3, render: () => <IndexerStats /> },
  { id: "historial", label: t.indexers.tabs.history, icon: History, render: () => <ProwlarrHistory /> },
  { id: "aplicaciones", label: t.indexers.tabs.apps, icon: Link2, render: () => <ProwlarrApps /> },
];

/** Prowlarr: indexadores (estado, alta, edición), estadísticas, historial y aplicaciones sincronizadas. */
export default function IndexersPage() {
  const { tab = tabs[0].id } = useParams();
  const configured = useIsConfigured("prowlarr");
  const current = tabs.find((x) => x.id === tab);
  if (!current) return <Navigate to="/indexadores" replace />;
  return (
    <Page title={t.nav.indexers}>
      {configured === false ? (
        <NotConfigured service="prowlarr" />
      ) : (
        <>
          <TabNav tabs={tabs} current={current.id} base="/indexadores" label={t.indexers.tabsLabel} />
          {current.render()}
        </>
      )}
    </Page>
  );
}
