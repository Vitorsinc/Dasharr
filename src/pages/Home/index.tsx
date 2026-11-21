import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
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
import { useSettings } from "@/hooks/useSettings";
import { openExternal } from "@/lib/tauri";
import { serviceWebUrl } from "@/lib/webUrl";
import { serviceSettingsPath } from "@/lib/settingsPaths";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { useTorrents } from "@/hooks/useTorrents";
import { useCalendar } from "@/hooks/useCalendar";
import { addDays, startOfDay } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate, formatEta, formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useItemDetail } from "@/pages/Calendar";
import { NowWatching } from "@/components/NowWatching";
import { HealthList } from "@/components/HealthList";
import { DuplicatesNotice } from "@/components/DuplicatesNotice";
import { HEALTH_SERVICES } from "@/api/health";
import { RecentlyAdded } from "@/components/plex/RecentlyAdded";
import { PendingRequests } from "@/components/seerr/PendingRequests";
import radarrLogo from "@/assets/services/radarr.svg";
import sonarrLogo from "@/assets/services/sonarr.svg";
import prowlarrLogo from "@/assets/services/prowlarr.svg";
import bazarrLogo from "@/assets/services/bazarr.svg";
import qbittorrentLogo from "@/assets/services/qbittorrent.svg";
import tracearrLogo from "@/assets/services/tracearr.svg";
import plexLogo from "@/assets/services/plex.svg";
import seerrLogo from "@/assets/services/seerr.svg";
import beszelLogo from "@/assets/services/beszel.svg";
import { ServerStats } from "@/components/ServerStats";

const servicePage: Record<ServiceKind, string> = {
  radarr: "/peliculas",
  sonarr: "/series",
  prowlarr: "/buscar",
  bazarr: "/subtitulos",
  qbittorrent: "/descargas",
  tracearr: "/historial",
  plex: "/plex",
  seerr: "/solicitudes",
  // Sin página propia: sus datos están en la propia Inicio («Servidor»).
  beszel: "/",
};

const serviceLogo: Record<ServiceKind, string> = {
  radarr: radarrLogo,
  sonarr: sonarrLogo,
  prowlarr: prowlarrLogo,
  bazarr: bazarrLogo,
  qbittorrent: qbittorrentLogo,
  tracearr: tracearrLogo,
  plex: plexLogo,
  seerr: seerrLogo,
  beszel: beszelLogo,
};

/** Botón a la derecha de la tarjeta que abre la web del servicio en el navegador (externa, si no local). */
function OpenWebButton({ service, url }: { service: ServiceKind; url: string }) {
  const label = t.home.openWeb(t.services[service]);
  return (
    <button
      type="button"
      className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-accent focus-visible:text-accent"
      onClick={() => void openExternal(url)}
      title={`${label}\n${url}`}
      aria-label={label}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** Estado de la conexión como punto de color + texto, sin fondo, para que quepa en la línea de la versión. */
function StatusText({ route }: { route: Parameters<typeof StatusBadge>[0]["route"] }) {
  const key = route ?? "unknown";
  const color = { local: "text-success", remote: "text-accent", offline: "text-danger", unknown: "text-muted" }[key];
  return (
    <span className={cn("flex shrink-0 items-center gap-1 whitespace-nowrap font-medium", color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t.route[key]}
    </span>
  );
}

function ServiceCard({ service, route }: { service: ServiceKind; route: Parameters<typeof StatusBadge>[0]["route"] }) {
  const { data: settings } = useSettings();
  const webUrl = serviceWebUrl(service, settings?.[service]?.config);
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
  // Tarjeta compacta de una sola fila: logo a la izquierda y, al lado, el nombre arriba y
  // «estado · versión» debajo (sin configurar: solo eso; «Añádelo en Ajustes» va en el tooltip). El detalle (versión o error) se recorta a una línea y se ve entero al pasar el ratón.
  // El botón va fuera del enlace (un botón dentro de un enlace no es válido) y se coloca encima de la tarjeta.
  return (
    <div className="relative min-w-0">
      <Link
        to={notConfigured ? serviceSettingsPath(service) : servicePage[service]}
        className={cn(
          "card group flex h-full min-w-0 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2",
          notConfigured && "border-dashed bg-transparent",
          webUrl && "pr-8",
        )}
        aria-label={name}
      >
        <img
          src={serviceLogo[service]}
          alt=""
          aria-hidden
          draggable={false}
          className={cn(
            "pointer-events-none h-7 w-7 shrink-0 select-none object-contain transition-opacity",
            notConfigured ? "opacity-30 grayscale" : "opacity-90 group-hover:opacity-100",
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-sm font-semibold leading-5", notConfigured && "text-muted")} title={name}>
            {name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
            {notConfigured ? (
              <span className="truncate font-medium text-muted" title={detail}>
                {t.home.notConfigured}
              </span>
            ) : (
              <>
                <StatusText route={v.isError ? "offline" : route} />
                <span className="text-muted" aria-hidden>
                  ·
                </span>
                <span className={cn("min-w-0 truncate tabular-nums", v.isError ? "text-danger" : "text-muted")} title={detail}>
                  {detail}
                </span>
              </>
            )}
          </span>
        </span>
      </Link>
      {webUrl && <OpenWebButton service={service} url={webUrl} />}
    </div>
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
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
            <div key={tr.hash} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:flex-nowrap">
              <div className="min-w-0 basis-full truncate text-sm font-medium md:flex-1 md:basis-auto" title={tr.name}>
                {tr.name}
              </div>
              <div className="min-w-0 flex-1 md:w-48 md:flex-none md:shrink-0">
                <ProgressBar value={tr.progress} />
              </div>
              <div className="hidden w-20 shrink-0 whitespace-nowrap md:block text-right text-xs tabular-nums text-muted">{formatBytes(tr.size)}</div>
              <div className="w-20 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted">{formatSpeed(tr.dlspeed)}</div>
              <div className="w-16 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted">{formatEta(tr.eta)}</div>
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
      <section className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2" aria-label={t.home.services}>
        {SERVICE_KINDS.map((s) => (
          <ServiceCard key={s} service={s} route={routes?.[s]} />
        ))}
      </section>
      <HealthList services={HEALTH_SERVICES} hideWhenOk />
      <ServerStats />
      <DuplicatesNotice />
      <PendingRequests />
      <NowWatching title={t.home.nowPlaying} hideWhenEmpty />
      <ActiveDownloads />
      <Upcoming />
      <RecentlyAdded />
    </Page>
  );
}
