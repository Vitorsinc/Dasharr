import { useState } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Pager, Segmented } from "@/components/ui";
import { historyDetail, historyEventLabel, historyTone, MarkFailedButton } from "@/components/media/ArrHistory";
import type { ArrService } from "@/api/arr";
import { arrActivity, HISTORY_PAGE, historyItemTitle, type HistoryFilter } from "@/api/arrActivity";
import { useLibraryTitles } from "@/hooks/useLibraryTitles";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

const FILTERS: HistoryFilter[] = ["all", "grabbed", "imported", "failed", "deleted", "renamed"];

/** Historial de descargas de todo Radarr o Sonarr, por páginas y filtrable por tipo de evento. */
export function GlobalHistory({ service }: { service: ArrService }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [page, setPage] = useState(1);
  const q = useServiceQuery(service, ["history", "global", filter, page], () => arrActivity(service).getHistory(page, filter), {
    keepPrevious: true,
    refetchInterval: REFRESH.queue,
  });
  const titles = useLibraryTitles(service);
  const records = q.data?.records ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.globalHistory.hint}</p>
      <Segmented<HistoryFilter>
        label={t.globalHistory.filter}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPage(1);
        }}
        options={FILTERS.map((f) => ({ value: f, label: t.globalHistory.filters[f] }))}
      />
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !records.length ? (
        <Empty>{t.globalHistory.empty}</Empty>
      ) : (
        <>
          <ul className="card divide-y divide-border" aria-label={t.activity.history}>
            {records.map((r) => {
              const detail = historyDetail(r);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                  <span className={cn("w-36 shrink-0 truncate font-medium", historyTone[r.eventType])}>{historyEventLabel(r)}</span>
                  <span className="w-48 shrink-0 truncate font-medium" title={historyItemTitle(r, titles)}>
                    {historyItemTitle(r, titles)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={r.sourceTitle}>
                    {r.sourceTitle}
                  </span>
                  {detail && (
                    <span className="max-w-[16rem] shrink truncate text-xs text-muted" title={detail}>
                      {detail}
                    </span>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted">{formatDateTime(r.date)}</span>
                  <span className="flex w-6 shrink-0 justify-end">
                    <MarkFailedButton service={service} record={r} />
                  </span>
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
