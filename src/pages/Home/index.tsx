import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel } from "@/components/ErrorPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { Empty, Loading, ProgressBar } from "@/components/ui";
import { Poster } from "@/components/media/PosterCard";
import { t } from "@/i18n/es";
import { isActive } from "@/api/qbit";
import { serviceVersion } from "@/api/status";
import { SERVICE_KINDS, type ServiceKind } from "@/lib/types";
import { useConnectionStates } from "@/hooks/useConnectionStates";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { useTorrents } from "@/hooks/useTorrents";
import { useCalendar } from "@/hooks/useCalendar";
import { addDays, startOfDay } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatEta, formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useItemDetail } from "@/pages/Calendar";
import { NowWatching } from "@/components/NowWatching";
import { RecentlyAdded } from "@/components/plex/RecentlyAdded";
import radarrLogo from "@/assets/services/radarr.svg";
import sonarrLogo from "@/assets/services/sonarr.svg";
import prowlarrLogo from "@/assets/services/prowlarr.svg";
import bazarrLogo from "@/assets/services/bazarr.svg";
import qbittorrentLogo from "@/assets/services/qbittorrent.svg";
import tracearrLogo from "@/assets/services/tracearr.svg";
import plexLogo from "@/assets/services/plex.svg";

const servicePage: Record<ServiceKind, string> = {
  radarr: "/peliculas",
  sonarr: "/series",
  prowlarr: "/buscar",
  bazarr: "/subtitulos",
  qbittorrent: "/descargas",
  tracearr: "/historial",
  plex: "/plex",
};

const serviceLogo: Record<ServiceKind, string> = {
  radarr: radarrLogo,
  sonarr: sonarrLogo,
  prowlarr: prowlarrLogo,
  bazarr: bazarrLogo,
  qbittorrent: qbittorrentLogo,
  tracearr: tracearrLogo,
  plex: plexLogo,
};

function ServiceCard({ service, route }: { service: ServiceKind; route: Parameters<typeof StatusBadge>[0]["route"] }) {
  const v = useServiceQuery(service, ["version"], () => serviceVersion(service), { refetchInterval: REFRESH.status });
  const name = t.services[service];
  const notConfigured = v.configured === false;
  const detail = notConfigured
    ? t.home.setUpInSettings
    : v.isError
      ? errorMessage(v.error)
      : v.data
        ? t.home.version(v.data)
        : t.common.loading;
  // Nombre, estado y detalle van en líneas separadas para que nada se pise aunque la tarjeta sea estrecha;
  // el detalle (versión o error) ocupa como mucho dos líneas y se ve entero al pasar el ratón.
  return (
    <Link
      to={notConfigured ? "/ajustes" : servicePage[service]}
      className={cn(
        "card group relative isolate flex min-w-0 flex-col items-start gap-2 overflow-hidden p-4 transition-colors hover:bg-surface-2",
        notConfigured && "border-dashed bg-transparent",
      )}
      aria-label={name}
    >
      {/* Logo grande de marca de agua, recortado por la esquina inferior derecha. */}
      <img
        src={serviceLogo[service]}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "pointer-events-none absolute -bottom-6 -right-6 -z-10 h-20 w-20 select-none transition-opacity",
          notConfigured ? "opacity-10 grayscale" : "opacity-45 group-hover:opacity-70",
        )}
      />
      <span className={cn("w-full truncate font-semibold", notConfigured && "text-muted")} title={name}>
        {name}
      </span>
      {notConfigured ? (
        <span className="chip whitespace-nowrap bg-surface-2 text-muted">{t.home.notConfigured}</span>
      ) : (
        <StatusBadge route={v.isError ? "offline" : route} />
      )}
      <span
        className={cn("line-clamp-2 w-full break-words text-xs tabular-nums", v.isError ? "text-danger" : "text-muted")}
        title={detail}
      >
        {detail}
      </span>
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
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 min-[1400px]:grid-cols-7" aria-label={t.home.services}>
        {SERVICE_KINDS.map((s) => (
          <ServiceCard key={s} service={s} route={routes?.[s]} />
        ))}
      </section>
      <NowWatching title={t.home.nowPlaying} hideWhenEmpty />
      <ActiveDownloads />
      <Upcoming />
      <RecentlyAdded />
    </Page>
  );
}
