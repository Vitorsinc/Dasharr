import { useEffect, useState } from "react";
import * as RD from "@radix-ui/react-dialog";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowUpCircle,
  CalendarDays,
  Captions,
  ChevronDown,
  Clapperboard,
  Compass,
  CopyMinus,
  Download,
  Gauge,
  History,
  Home,
  Inbox,
  Library,
  Menu,
  MonitorPlay,
  Radar,
  Search,
  Settings,
  Tv,
  X,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { versionLabel } from "@/lib/version";
import { usePrefs } from "@/hooks/usePrefs";
import { useUpdateState } from "@/hooks/useUpdates";
import { DiskIndicator } from "./DiskIndicator";
import { Torii } from "./icons/Torii";
import type { ServiceKind } from "@/lib/types";
import radarrLogo from "@/assets/services/radarr.svg";
import sonarrLogo from "@/assets/services/sonarr.svg";
import prowlarrLogo from "@/assets/services/prowlarr.svg";
import bazarrLogo from "@/assets/services/bazarr.svg";
import qbittorrentLogo from "@/assets/services/qbittorrent.svg";
import plexLogo from "@/assets/services/plex.svg";
import seerrLogo from "@/assets/services/seerr.svg";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Nombre para lectores de pantalla cuando la etiqueta se repite en varios grupos («Actividad · Radarr»). */
  ariaLabel?: string;
}

/** Páginas que mezclan varios servicios: van arriba, sin grupo. */
const general: NavItem[] = [
  { to: "/", label: t.nav.home, icon: Home, end: true },
  { to: "/calendario", label: t.nav.calendar, icon: CalendarDays },
];

/** El resto, agrupado por el servicio del que salen los datos. */
const groups: { service: ServiceKind; logo: string; items: NavItem[] }[] = [
  {
    service: "radarr",
    logo: radarrLogo,
    items: [
      { to: "/peliculas", label: t.nav.movies, icon: Clapperboard },
      { to: "/colecciones", label: t.nav.collections, icon: Library },
      { to: "/actividad/radarr", label: t.activity.nav, icon: Activity, ariaLabel: `${t.activity.nav} · ${t.services.radarr}` },
    ],
  },
  {
    service: "sonarr",
    logo: sonarrLogo,
    items: [
      { to: "/series", label: t.nav.series, icon: Tv },
      { to: "/anime", label: t.nav.anime, icon: Torii },
      { to: "/actividad/sonarr", label: t.activity.nav, icon: Activity, ariaLabel: `${t.activity.nav} · ${t.services.sonarr}` },
    ],
  },
  {
    service: "qbittorrent",
    logo: qbittorrentLogo,
    items: [
      { to: "/descargas", label: t.nav.downloads, icon: Download },
      { to: "/duplicados", label: t.nav.duplicates, icon: CopyMinus },
    ],
  },
  {
    service: "prowlarr",
    logo: prowlarrLogo,
    items: [
      { to: "/buscar", label: t.nav.search, icon: Search },
      { to: "/indexadores", label: t.nav.indexers, icon: Radar },
      { to: "/trackers", label: t.nav.trackers, icon: Gauge },
    ],
  },
  { service: "bazarr", logo: bazarrLogo, items: [{ to: "/subtitulos", label: t.nav.subtitles, icon: Captions }] },
  // El historial sale de Tracearr, pero es lo que se ha visto en Plex: va con Plex para no sumar otro grupo.
  {
    service: "plex",
    logo: plexLogo,
    items: [
      { to: "/plex", label: t.nav.plexServer, icon: MonitorPlay },
      { to: "/historial", label: t.nav.history, icon: History },
    ],
  },
  {
    service: "seerr",
    logo: seerrLogo,
    items: [
      { to: "/solicitudes", label: t.nav.requests, icon: Inbox },
      { to: "/descubrir", label: t.nav.discover, icon: Compass },
    ],
  },
];

function Item({ to, label, icon: Icon, end, ariaLabel }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={ariaLabel}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          isActive ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("h-[18px] w-[18px]", isActive && "text-accent")} aria-hidden />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** Servicio del que salen los datos de la página abierta; las páginas generales no tienen. */
export function serviceForPath(pathname: string): ServiceKind | undefined {
  return groups.find((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)))?.service;
}

function Group({ service, logo, items }: (typeof groups)[number]) {
  const [prefs, setPrefs] = usePrefs();
  const { pathname } = useLocation();
  const name = t.services[service];
  const collapsed = prefs.sidebarCollapsed.includes(service);
  const holdsActive = items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  const toggle = () =>
    setPrefs({
      sidebarCollapsed: collapsed
        ? prefs.sidebarCollapsed.filter((s) => s !== service)
        : [...prefs.sidebarCollapsed, service],
    });
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? t.nav.expand(name) : t.nav.collapse(name)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition-colors hover:text-fg",
          collapsed && holdsActive ? "text-accent" : "text-muted",
        )}
      >
        <img src={logo} alt="" className="h-4 w-4" />
        <span className="flex-1 text-left">{name}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 opacity-50 transition group-hover:opacity-100", collapsed && "-rotate-90")}
          aria-hidden
        />
      </button>
      {!collapsed && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {items.map((i) => (
            <Item key={i.to} {...i} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Marca: un guion y una flecha, «dash» y «arr». */
function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden>
      <rect width="28" height="28" rx="7" className="fill-brand" />
      <path
        d="M7 14h6M15.5 8.5 21 14l-5.5 5.5"
        fill="none"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-bg"
      />
    </svg>
  );
}

/** Aparece solo cuando hay una versión nueva; lleva a Ajustes → Sistema para instalarla. */
function UpdateItem() {
  const { available } = useUpdateState();
  if (!available) return null;
  return (
    <NavLink
      to="/ajustes/sistema"
      className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-surface-2/60"
    >
      <ArrowUpCircle className="h-[18px] w-[18px]" aria-hidden />
      <span>{t.updates.sidebar(available.version)}</span>
    </NavLink>
  );
}

/** Contenido del menú: el mismo en la barra lateral del escritorio y en el panel del móvil. */
function NavContent() {
  return (
    <>
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <Logo />
        <span className="font-display text-xl font-extrabold [font-stretch:78%]">{t.app.name}</span>
      </div>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2">
        <div className="flex flex-col gap-0.5">
          {general.map((i) => (
            <Item key={i.to} {...i} />
          ))}
        </div>
        {groups.map((g) => (
          <Group key={g.service} {...g} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <DiskIndicator />
        <UpdateItem />
        <Item to="/ajustes" label={t.nav.settings} icon={Settings} />
      </div>
      <div className="mt-2 px-3 text-xs text-muted" title={t.app.version}>
        {versionLabel()}
      </div>
    </>
  );
}

/** Barra lateral del escritorio (oculta en pantallas estrechas, donde se usa `MobileNav`). */
export function Sidebar() {
  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
      <NavContent />
    </nav>
  );
}

/** Accesos de la barra inferior del móvil; el resto de páginas está en «Menú». */
const tabs: NavItem[] = [
  { to: "/", label: t.nav.home, icon: Home, end: true },
  { to: "/peliculas", label: t.nav.movies, icon: Clapperboard },
  { to: "/series", label: t.nav.series, icon: Tv },
  { to: "/descargas", label: t.nav.downloads, icon: Download },
];

/** Móvil: barra inferior con las páginas más usadas y un panel lateral con el menú completo. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { available } = useUpdateState();
  // Al cambiar de página se cierra el panel.
  useEffect(() => setOpen(false), [pathname]);
  const inTabs = tabs.some((i) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`)));
  return (
    <>
      <nav
        aria-label={t.nav.mobileBar}
        className="flex shrink-0 items-stretch border-t border-border bg-surface md:hidden"
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium",
                isActive ? "text-accent" : "text-muted",
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={cn(
            "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium",
            inTabs ? "text-muted" : "text-accent",
          )}
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span>{t.nav.more}</span>
          {available && <span className="absolute right-[calc(50%-14px)] top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden />}
        </button>
      </nav>
      <RD.Root open={open} onOpenChange={setOpen}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-40 bg-black/60 md:hidden" />
          <RD.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface px-3 py-4 shadow-2xl outline-none md:hidden"
          >
            <RD.Title className="sr-only">{t.nav.more}</RD.Title>
            <RD.Close className="btn-ghost absolute right-3 top-4 p-1.5" aria-label={t.common.close}>
              <X className="h-5 w-5" />
            </RD.Close>
            <NavContent />
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </>
  );
}
