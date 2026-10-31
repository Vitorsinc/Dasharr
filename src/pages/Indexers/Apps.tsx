import { RefreshCw } from "lucide-react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import { prowlarr } from "@/api/prowlarr";
import { useRun } from "@/hooks/useArrManage";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

export function ProwlarrApps() {
  const q = useServiceQuery("prowlarr", ["applications"], prowlarr.getApplications);
  const run = useRun("prowlarr");
  const apps = [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t.indexers.apps.hint}</p>
        <button className="btn-primary" disabled={!apps.length} onClick={() => run(prowlarr.syncApplications, t.indexers.apps.synced, [])}>
          <RefreshCw className="h-4 w-4" aria-hidden /> {t.indexers.apps.sync}
        </button>
      </div>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="prowlarr" error={q.error} onRetry={() => q.refetch()} />
      ) : !apps.length ? (
        <Empty>{t.indexers.apps.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.indexers.tabs.apps}>
          {apps.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.name}</div>
                {a.implementationName && <div className="text-xs text-muted">{a.implementationName}</div>}
              </div>
              <span className={cn("chip", a.syncLevel === "disabled" ? "bg-surface-2 text-muted" : "bg-success/15 text-success")}>
                {t.indexers.apps.level[a.syncLevel] ?? a.syncLevel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
