import { NavLink } from "react-router-dom";
import { CalendarDays, Captions, Clapperboard, Download, Home, ScrollText, Search, Settings, Sparkles, Tv } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { versionLabel } from "@/lib/version";

const items = [
  { to: "/", label: t.nav.home, icon: Home, end: true },
  { to: "/peliculas", label: t.nav.movies, icon: Clapperboard },
  { to: "/series", label: t.nav.series, icon: Tv },
  { to: "/anime", label: t.nav.anime, icon: Sparkles },
  { to: "/descargas", label: t.nav.downloads, icon: Download },
  { to: "/buscar", label: t.nav.search, icon: Search },
  { to: "/subtitulos", label: t.nav.subtitles, icon: Captions },
  { to: "/calendario", label: t.nav.calendar, icon: CalendarDays },
];

function Item({ to, label, icon: Icon, end }: (typeof items)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">D</div>
        <span className="text-lg font-semibold tracking-tight">{t.app.name}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {items.map((i) => (
          <Item key={i.to} {...i} />
        ))}
      </div>
      <Item to="/registro" label={t.nav.logs} icon={ScrollText} />
      <Item to="/ajustes" label={t.nav.settings} icon={Settings} />
      <div className="mt-3 px-3 text-xs text-muted" title={t.app.version}>
        {versionLabel()}
      </div>
    </nav>
  );
}
