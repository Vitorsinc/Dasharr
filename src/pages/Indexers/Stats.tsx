import { useMemo } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import { prowlarr, type IndexerStat } from "@/api/prowlarr";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { formatCount } from "@/lib/format";

/** Fallos de un indexador: búsquedas, descargas, RSS e inicios de sesión fallidos. */
export function statFailures(s: IndexerStat) {
  return (s.numberOfFailedQueries ?? 0) + (s.numberOfFailedGrabs ?? 0) + (s.numberOfFailedRssQueries ?? 0) + (s.numberOfFailedAuthQueries ?? 0);
}

export function IndexerStats() {
  const q = useServiceQuery("prowlarr", ["indexerstats"], prowlarr.getStats, { refetchInterval: REFRESH.status });
  const rows = useMemo(
    () => [...(q.data?.indexers ?? [])].sort((a, b) => (b.numberOfQueries ?? 0) - (a.numberOfQueries ?? 0) || a.indexerName.localeCompare(b.indexerName)),
    [q.data],
  );
  const sum = (f: (s: IndexerStat) => number) => rows.reduce((n, s) => n + f(s), 0);

  if (q.isLoading || q.configured === undefined) return <Loading />;
  if (q.isError) return <ErrorPanel service="prowlarr" error={q.error} onRetry={() => q.refetch()} />;
  if (!rows.length) return <Empty>{t.indexers.stats.empty}</Empty>;
  const num = "px-3 py-2 text-right tabular-nums";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t.indexers.stats.hint}</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t.indexers.stats.indexer}
              </th>
              <th scope="col" className={`${num} font-medium`}>
                {t.indexers.stats.queries}
              </th>
              <th scope="col" className={`${num} font-medium`}>
                {t.indexers.stats.rss}
              </th>
              <th scope="col" className={`${num} font-medium`}>
                {t.indexers.stats.grabs}
              </th>
              <th scope="col" className={`${num} font-medium`}>
                {t.indexers.stats.failed}
              </th>
              <th scope="col" className={`${num} font-medium`}>
                {t.indexers.stats.response}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => {
              const failed = statFailures(s);
              return (
                <tr key={s.indexerId}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {s.indexerName}
                  </th>
                  <td className={num}>{formatCount(s.numberOfQueries ?? 0)}</td>
                  <td className={num}>{formatCount(s.numberOfRssQueries ?? 0)}</td>
                  <td className={num}>{formatCount(s.numberOfGrabs ?? 0)}</td>
                  <td className={`${num} ${failed ? "text-warning" : "text-muted"}`}>{formatCount(failed)}</td>
                  <td className={`${num} text-muted`}>{t.indexers.stats.ms(Math.round(s.averageResponseTime ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border font-medium">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                {t.indexers.stats.total}
              </th>
              <td className={num}>{formatCount(sum((s) => s.numberOfQueries ?? 0))}</td>
              <td className={num}>{formatCount(sum((s) => s.numberOfRssQueries ?? 0))}</td>
              <td className={num}>{formatCount(sum((s) => s.numberOfGrabs ?? 0))}</td>
              <td className={num}>{formatCount(sum(statFailures))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
