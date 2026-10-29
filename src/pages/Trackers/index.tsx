import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { getTrackerStats, type TrackerStats, type TrackerStatus, type TrackerUser } from "@/api/trackers";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

// El límite de UNIT3D es de 30 peticiones por minuto, compartido con las búsquedas de Prowlarr.
const REFRESH_MS = 30 * 60_000;

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const num = (n: number | null) => (n == null ? "—" : nf.format(n));
const nfCompact = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });
const compact = (n: number | null) => (n == null ? "—" : nfCompact.format(n));

function bufferLabel(u: TrackerUser) {
  if (u.bufferInfinite) return t.trackers.infinite;
  if (u.buffer == null) return "—";
  return u.buffer < 0 ? `-${formatBytes(-u.buffer)}` : formatBytes(u.buffer);
}

function ratioTone(r: number | null) {
  if (r == null || r >= 1) return "text-success";
  return r >= 0.6 ? "text-warning" : "text-danger";
}

const statusStyle: Record<TrackerStatus, string> = {
  ok: "bg-success/15 text-success",
  unauthorized: "bg-danger/15 text-danger",
  unsupported: "bg-surface-2 text-muted",
  rateLimited: "bg-warning/15 text-warning",
  unavailable: "bg-danger/15 text-danger",
};

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap text-[11px] leading-tight text-muted">{label}</span>
      <span className={cn("whitespace-nowrap text-sm font-medium tabular-nums", className)}>{value}</span>
    </div>
  );
}

function TrackerCard({ tr }: { tr: TrackerStats & { user: TrackerUser } }) {
  const u = tr.user;
  return (
    <article className="card flex flex-col gap-2.5 px-3.5 py-3" aria-label={tr.name}>
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{tr.name}</div>
          <div className="truncate text-xs text-muted" title={u.username}>{u.group || u.username}</div>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", ratioTone(u.ratio))} title={t.trackers.ratio}>
          {u.ratio == null ? t.trackers.infinite : nf.format(u.ratio)}
        </div>
      </header>
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <span className="flex items-center gap-1" title={t.trackers.uploaded}>
          <ArrowUp className="h-3.5 w-3.5 text-success" aria-hidden />
          {formatBytes(u.uploaded)}
        </span>
        <span className="flex items-center gap-1" title={t.trackers.downloaded}>
          <ArrowDown className="h-3.5 w-3.5 text-accent" aria-hidden />
          {formatBytes(u.downloaded)}
        </span>
      </div>
      <div className="flex justify-between gap-3 border-t border-border pt-2">
        <Stat label={t.trackers.buffer} value={bufferLabel(u)} className={u.buffer != null && u.buffer < 0 ? "text-danger" : undefined} />
        <Stat label={t.trackers.seeding} value={num(u.seeding)} />
        <Stat label={t.trackers.bonus} value={compact(u.seedbonus)} />
        <Stat label={t.trackers.hitAndRuns} value={num(u.hitAndRuns)} className={u.hitAndRuns ? "text-danger" : undefined} />
      </div>
    </article>
  );
}

function Unavailable({ list }: { list: TrackerStats[] }) {
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.trackers.unavailableTitle}</h2>
      <div className="card divide-y divide-border">
        {list.map((tr) => (
          <div key={tr.indexerId} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{tr.name}</div>
              {tr.message && <div className="truncate text-xs text-muted">{tr.message}</div>}
            </div>
            <span className={cn("chip", statusStyle[tr.status])}>{t.trackers.status[tr.status]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TrackersPage() {
  const q = useServiceQuery("prowlarr", ["unit3d"], getTrackerStats, { refetchInterval: REFRESH_MS, staleTime: REFRESH_MS / 2 });
  const list = q.data ?? [];
  const ok = list.filter((x): x is TrackerStats & { user: TrackerUser } => x.status === "ok" && x.user != null);
  const rest = list.filter((x) => !ok.includes(x as never));
  return (
    <Page
      title={t.nav.trackers}
      actions={
        q.configured !== false && (
          <button className="btn-outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {t.trackers.refresh}
          </button>
        )
      }
    >
      <p className="-mt-3 text-sm text-muted">{t.trackers.hint}</p>
      {q.configured === false ? (
        <ErrorPanel service="prowlarr" error={{ kind: "NotConfigured" }} />
      ) : q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="prowlarr" error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty>{t.trackers.none}</Empty>
        </div>
      ) : (
        <>
          {ok.length > 0 && (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {ok.map((tr) => (
                <TrackerCard key={tr.indexerId} tr={tr} />
              ))}
            </section>
          )}
          <Unavailable list={rest} />
        </>
      )}
    </Page>
  );
}
