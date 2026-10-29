import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel } from "@/components/ErrorPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { Empty, Loading, ProgressBar } from "@/components/ui";
import { Poster } from "@/components/media/PosterCard";
import { t } from "@/i18n/es";
import { isActive, qbit } from "@/api/qbit";
import { serviceVersion } from "@/api/status";
import { getDiskSpace, isSystemDisk, mergeDisks, type Disk } from "@/api/diskspace";
import { SERVICE_KINDS, type ServiceKind } from "@/lib/types";
import { useConnectionStates } from "@/hooks/useConnectionStates";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { useTorrents } from "@/hooks/useTorrents";
import { useCalendar } from "@/hooks/useCalendar";
import { addDays, startOfDay } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate, formatEta, formatPercent, formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useItemDetail } from "@/pages/Calendar";

const servicePage: Record<ServiceKind, string> = {
  radarr: "/peliculas",
  sonarr: "/series",
  prowlarr: "/buscar",
  bazarr: "/subtitulos",
  qbittorrent: "/descargas",
};

function ServiceCard({ service, route }: { service: ServiceKind; route: Parameters<typeof StatusBadge>[0]["route"] }) {
  const v = useServiceQuery(service, ["version"], () => serviceVersion(service), { refetchInterval: REFRESH.status });
  return (
    <Link
      to={v.configured === false ? "/ajustes" : servicePage[service]}
      className="card flex flex-col gap-2 p-4 transition-colors hover:bg-surface-2"
      aria-label={t.services[service]}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{t.services[service]}</span>
        {v.configured !== false && <StatusBadge route={v.isError ? "offline" : route} />}
      </div>
      <div className={cn("truncate text-xs", v.isError ? "text-danger" : "text-muted")}>
        {v.configured === false
          ? t.common.notConfigured(t.services[service])
          : v.isError
            ? errorMessage(v.error)
            : v.data
              ? t.home.version(v.data)
              : t.common.loading}
      </div>
    </Link>
  );
}

function ActiveDownloads() {
  const torrents = useTorrents();
  if (torrents.configured === false) return null;
  const active = (torrents.data ?? []).filter(isActive);
  const dl = (torrents.data ?? []).reduce((a, x) => a + x.dlspeed, 0);
  const up = (torrents.data ?? []).reduce((a, x) => a + x.upspeed, 0);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.home.activeDownloads}</h2>
        <div className="flex items-center gap-4 text-sm tabular-nums text-muted">
          <span className="flex items-center gap-1">
            <ArrowDown className="h-4 w-4" />
            {formatSpeed(dl)}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp className="h-4 w-4" />
            {formatSpeed(up)}
          </span>
          <Link to="/descargas" className="text-accent hover:underline">
            {t.home.seeAll}
          </Link>
        </div>
      </div>
      {torrents.isLoading ? (
        <Loading />
      ) : torrents.isError ? (
        <ErrorPanel service="qbittorrent" error={torrents.error} onRetry={() => torrents.refetch()} compact />
      ) : active.length === 0 ? (
        <div className="card">
          <Empty>{t.home.noActive}</Empty>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {active.slice(0, 5).map((tr) => (
            <div key={tr.hash} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 truncate text-sm font-medium" title={tr.name}>
                {tr.name}
              </div>
              <div className="w-48">
                <ProgressBar value={tr.progress} />
              </div>
              <div className="w-20 text-right text-xs tabular-nums text-muted">{formatSpeed(tr.dlspeed)}</div>
              <div className="w-16 text-right text-xs tabular-nums text-muted">{formatEta(tr.eta)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DiskCard({ disk }: { disk: Disk }) {
  const used = disk.total ? 1 - disk.free / disk.total : undefined;
  const [main, ...rest] = disk.paths;
  const name = disk.label || (isSystemDisk(disk) ? `${t.home.diskSystem} (${main})` : main) || t.home.diskDownloads;
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold" title={disk.paths.join(", ")}>
          {name}
        </span>
        {used != null && <span className="shrink-0 text-xs tabular-nums text-muted">{t.home.diskUsed(formatPercent(used))}</span>}
      </div>
      {used != null && <ProgressBar value={used} tone={used >= 0.95 ? "danger" : used >= 0.85 ? "warning" : "accent"} />}
      <div className="text-sm tabular-nums">
        {disk.total ? t.home.diskFree(formatBytes(disk.free), formatBytes(disk.total)) : t.home.diskFreeOnly(formatBytes(disk.free))}
      </div>
      {rest.length > 0 && (
        <div className="truncate text-xs text-muted" title={rest.join(", ")}>
          {t.home.diskAlsoAt(rest.join(", "))}
        </div>
      )}
    </div>
  );
}

function DiskSpace() {
  const radarr = useServiceQuery("radarr", ["diskspace"], () => getDiskSpace("radarr"), { refetchInterval: REFRESH.status });
  const sonarr = useServiceQuery("sonarr", ["diskspace"], () => getDiskSpace("sonarr"), { refetchInterval: REFRESH.status });
  const qb = useServiceQuery("qbittorrent", ["free-space"], qbit.getServerState, { refetchInterval: REFRESH.queue });
  const queries = [radarr, sonarr, qb];
  const disks = useMemo(
    () =>
      mergeDisks(
        [
          { service: "radarr", disks: radarr.data },
          { service: "sonarr", disks: sonarr.data },
        ],
        qb.data?.free_space_on_disk,
      ),
    [radarr.data, sonarr.data, qb.data],
  );
  if (queries.every((q) => q.configured === false)) return null;
  const loading = queries.some((q) => q.isLoading);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.home.diskSpace}</h2>
      {disks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {disks.map((d) => (
            <DiskCard key={d.paths[0] ?? d.sources.join()} disk={d} />
          ))}
        </div>
      ) : loading ? (
        <Loading />
      ) : (
        <div className="card">
          <Empty>{t.home.noDisks}</Empty>
        </div>
      )}
    </section>
  );
}

function Upcoming() {
  const start = useMemo(() => startOfDay(new Date()), []);
  const cal = useCalendar(start, addDays(start, 7));
  const { openItem, dialogs } = useItemDetail();
  if (cal.noneConfigured) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.calendar.upcoming}</h2>
        <Link to="/calendario" className="text-sm text-accent hover:underline">
          {t.home.seeAll}
        </Link>
      </div>
      {cal.errors.map((e) => (
        <ErrorPanel key={e.service} service={e.service} error={e.error} onRetry={cal.refetch} compact />
      ))}
      {cal.isLoading ? (
        <Loading />
      ) : cal.items.length === 0 ? (
        <div className="card">
          <Empty>{t.calendar.nothing}</Empty>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {cal.items.map((it) => (
            <button key={it.id} onClick={() => openItem(it)} className="w-32 shrink-0 text-left" aria-label={it.title}>
              <Poster src={it.poster} title={it.title} className={cn(it.hasFile && "opacity-60")} />
              <div className="mt-1.5 truncate text-sm font-medium">{it.title}</div>
              <div className="truncate text-xs text-muted">
                {formatDate(it.date)} · {it.subtitle}
              </div>
            </button>
          ))}
        </div>
      )}
      {dialogs}
    </section>
  );
}

export default function HomePage() {
  const { data: routes } = useConnectionStates();
  return (
    <Page title={t.nav.home}>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label={t.home.services}>
        {SERVICE_KINDS.map((s) => (
          <ServiceCard key={s} service={s} route={routes?.[s]} />
        ))}
      </section>
      <ActiveDownloads />
      <DiskSpace />
      <Upcoming />
    </Page>
  );
}
