import { NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Captions,
  ChevronDown,
  Clapperboard,
  Download,
  Gauge,
  History,
  Home,
  MonitorPlay,
  Radar,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { versionLabel } from "@/lib/version";
import { usePrefs } from "@/hooks/usePrefs";
import type { ServiceKind } from "@/lib/types";
import radarrLogo from "@/assets/services/radarr.svg";
import sonarrLogo from "@/assets/services/sonarr.svg";
import prowlarrLogo from "@/assets/services/prowlarr.svg";
import bazarrLogo from "@/assets/services/bazarr.svg";
import qbittorrentLogo from "@/assets/services/qbittorrent.svg";
import plexLogo from "@/assets/services/plex.svg";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Páginas que mezclan varios servicios: van arriba, sin grupo. */
const general: NavItem[] = [
  { to: "/", label: t.nav.home, icon: Home, end: true },
  { to: "/calendario", label: t.nav.calendar, icon: CalendarDays },
];

/** El resto, agrupado por el servicio del que salen los datos. */
const groups: { service: ServiceKind; logo: string; items: NavItem[] }[] = [
  { service: "radarr", logo: radarrLogo, items: [{ to: "/peliculas", label: t.nav.movies, icon: Clapperboard }] },
  {
    service: "sonarr",
    logo: sonarrLogo,
    items: [
      { to: "/series", label: t.nav.series, icon: Tv },
      { to: "/anime", label: t.nav.anime, icon: Sparkles },
    ],
  },
  { service: "qbittorrent", logo: qbittorrentLogo, items: [{ to: "/descargas", label: t.nav.downloads, icon: Download }] },
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
];

function Item({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
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
          "flex w-full items-center gap-2 rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-fg",
          collapsed && holdsActive ? "text-accent" : "text-muted/80",
        )}
      >
        <img src={logo} alt="" className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{name}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} aria-hidden />
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

export function Sidebar() {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">D</div>
        <span className="text-lg font-semibold tracking-tight">{t.app.name}</span>
      </div>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
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
        <Item to="/registro" label={t.nav.logs} icon={ScrollText} />
        <Item to="/ajustes" label={t.nav.settings} icon={Settings} />
      </div>
      <div className="mt-3 px-3 text-xs text-muted" title={t.app.version}>
        {versionLabel()}
      </div>
    </nav>
  );
}
