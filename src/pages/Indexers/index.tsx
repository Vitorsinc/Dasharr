import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { HealthList } from "@/components/HealthList";
import { Empty, Loading, Spinner, Toggle } from "@/components/ui";
import { prowlarr, testFailure, type Indexer, type IndexerStatus } from "@/api/prowlarr";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

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

export default function IndexersPage() {
  const qc = useQueryClient();
  const indexers = useServiceQuery("prowlarr", ["indexers"], prowlarr.getIndexers, { refetchInterval: REFRESH.status });
  const status = useServiceQuery("prowlarr", ["indexerstatus"], prowlarr.getIndexerStatus, { refetchInterval: REFRESH.status });
  const [testing, setTesting] = useState<Set<number>>(new Set());
  const [failures, setFailures] = useState<Record<number, string>>({});
  const statusById = useMemo(() => new Map((Array.isArray(status.data) ? status.data : []).map((s) => [s.indexerId, s])), [status.data]);
  const list = useMemo(
    () => [...(indexers.data ?? [])].sort((a, b) => Number(b.enable) - Number(a.enable) || a.name.localeCompare(b.name)),
    [indexers.data],
  );

  if (indexers.configured === false)
    return (
      <Page title={t.nav.indexers}>
        <NotConfigured service="prowlarr" />
      </Page>
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
    <Page
      title={t.nav.indexers}
      actions={
        <button className="btn-primary" disabled={!on || testing.size > 0} onClick={testAll}>
          {testing.size > 0 ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />} {t.indexers.testAll}
        </button>
      }
    >
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
                </div>
              );
            })}
          </div>
        </>
      )}
    </Page>
  );
}
