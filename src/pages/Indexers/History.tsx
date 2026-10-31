import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Pager, Segmented } from "@/components/ui";
import { HISTORY_PAGE, prowlarr, PROWLARR_EVENT_IDS, type ProwlarrHistoryRecord } from "@/api/prowlarr";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { formatDateTime } from "@/lib/format";

type Filter = "all" | keyof typeof PROWLARR_EVENT_IDS;
const FILTERS: Filter[] = ["all", "indexerQuery", "releaseGrabbed", "indexerRss", "indexerAuth"];

/** Qué se buscó o descargó y desde dónde: la consulta o el título, la aplicación y los resultados. */
export function prowlarrHistoryDetail(r: ProwlarrHistoryRecord): { what: string; extra: string } {
  const d = r.data ?? {};
  const what = r.eventType === "releaseGrabbed" ? (d.grabTitle ?? d.title ?? "") : (d.query ?? "");
  const extra = [
    d.source ? t.indexers.history.from(d.source) : "",
    d.queryResults != null && r.eventType !== "releaseGrabbed" ? t.indexers.history.results(d.queryResults) : "",
    d.elapsedTime ? t.indexers.stats.ms(Number(d.elapsedTime)) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { what, extra };
}

export function ProwlarrHistory() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const eventType = filter === "all" ? undefined : PROWLARR_EVENT_IDS[filter];
  const q = useServiceQuery("prowlarr", ["history", filter, page], () => prowlarr.getHistory(page, eventType), {
    keepPrevious: true,
    refetchInterval: REFRESH.status,
  });
  const indexers = useServiceQuery("prowlarr", ["indexers"], prowlarr.getIndexers, { refetchInterval: REFRESH.status });
  const names = useMemo(() => new Map((indexers.data ?? []).map((x) => [x.id, x.name])), [indexers.data]);
  const records = q.data?.records ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Segmented<Filter>
        label={t.indexers.history.filter}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPage(1);
        }}
        options={FILTERS.map((f) => ({ value: f, label: f === "all" ? t.indexers.history.all : t.indexers.history.events[f] }))}
      />
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="prowlarr" error={q.error} onRetry={() => q.refetch()} />
      ) : !records.length ? (
        <Empty>{t.indexers.history.empty}</Empty>
      ) : (
        <>
          <ul className="card divide-y divide-border" aria-label={t.indexers.tabs.history}>
            {records.map((r) => {
              const { what, extra } = prowlarrHistoryDetail(r);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  {r.successful ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={t.indexers.history.ok} />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label={t.indexers.history.failed} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{names.get(r.indexerId) ?? `#${r.indexerId}`}</span>
                      <span className="text-xs text-muted">{t.indexers.history.events[r.eventType] ?? t.indexers.history.events.unknown}</span>
                    </div>
                    {what && (
                      <div className="truncate" title={what}>
                        {what}
                      </div>
                    )}
                    {extra && <div className="text-xs text-muted">{extra}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(r.date)}</span>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={HISTORY_PAGE} total={q.data?.totalRecords ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
