import { useState } from "react";
import { Check, CheckCircle2, Circle, Film } from "lucide-react";
import type { MyWatch } from "@/api/tracearr";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";
import type { LibState, Scores } from "./library";
import { RatingBadges } from "./RatingBadges";
import { MonitorRibbon, PosterMonitorToggle, ribbonLabel, type RibbonState } from "./MonitorToggle";

export function Poster({ src, title, className }: { src?: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative aspect-[2/3] self-start overflow-hidden rounded-lg bg-surface-2", className)}>
      {src && !failed ? (
        <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted">
          <Film className="h-8 w-8" aria-hidden />
          <span className="line-clamp-3">{title}</span>
        </div>
      )}
    </div>
  );
}

export function PosterCard({
  title,
  subtitle,
  poster,
  state,
  scores,
  onClick,
  selected,
  watch,
  monitored,
  downloading,
  ribbonState,
  onToggleMonitor,
}: {
  title: string;
  subtitle?: string;
  poster?: string;
  state?: LibState;
  /** Notas que se ven sobre el póster (ya filtradas por Ajustes). */
  scores?: Scores;
  onClick?: () => void;
  /** En modo selección: si está elegida (el botón pasa a ser un interruptor con aria-pressed). */
  selected?: boolean;
  /** Lo que has visto tú (según Tracearr): marca de visto o barra de progreso. */
  watch?: MyWatch;
  /** Si está monitorizada; por defecto se deduce de `state`. */
  monitored?: boolean;
  /** Si hay una descarga en curso (cola de Radarr/Sonarr): la cinta sale azul. */
  downloading?: boolean;
  /** Color de la cinta más fino que `state` (p. ej. serie a medias); por defecto se deduce de `state`. */
  ribbonState?: RibbonState;
  /** Si se pasa, la cinta se puede pulsar para monitorizar o dejar de monitorizar sin abrir la ficha. */
  onToggleMonitor?: () => void;
}) {
  const selecting = selected !== undefined;
  const isMonitored = monitored ?? state !== "unmonitored";
  const ribbon: RibbonState | null = !state
    ? null
    : downloading
      ? "downloading"
      : (ribbonState ?? (state === "unmonitored" ? "none" : state));
  return (
    <div className="group relative flex flex-col gap-2">
      <button onClick={onClick} className="group/card flex flex-col gap-2 text-left outline-none" aria-label={title} aria-pressed={selected}>
      <div className="relative transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible/card:ring-2 group-focus-visible/card:ring-accent rounded-lg">
        <Poster src={poster} title={title} className="shadow-sm group-hover:shadow-lg" />
        {ribbon && (!onToggleMonitor || selecting) && (
          <span className="absolute right-2.5 top-0" title={ribbonLabel[ribbon]}>
            <MonitorRibbon monitored={isMonitored} state={ribbon} />
          </span>
        )}
        <RatingBadges scores={scores} />
        {watch && !selecting && <WatchMark watch={watch} />}
        {selecting && (
          <span
            className={cn(
              "absolute inset-0 flex items-start justify-start rounded-lg p-2 transition-colors",
              selected ? "bg-accent/25 ring-2 ring-accent" : "bg-black/20",
            )}
            aria-hidden
          >
            {selected ? (
              <CheckCircle2 className="h-6 w-6 rounded-full bg-accent text-accent-fg" />
            ) : (
              <Circle className="h-6 w-6 text-white drop-shadow" />
            )}
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" title={title}>
          {title}
        </div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      </button>
      {ribbon && onToggleMonitor && !selecting && (
        <PosterMonitorToggle
          monitored={isMonitored}
          state={ribbon}
          what={title}
          onToggle={onToggleMonitor}
          className="transition-transform duration-200 group-hover:-translate-y-0.5"
        />
      )}
    </div>
  );
}

/** Proporción vista: episodios en series, media en una película empezada. */
export function watchProgress(w: MyWatch): number {
  if (w.state === "watched") return 1;
  if (w.episodeCount) return Math.min(1, (w.episodesWatched ?? 0) / w.episodeCount);
  return 0.5;
}

export function watchLabel(w: MyWatch): string {
  if (w.episodeCount) return t.myWatch.episodes(w.episodesWatched ?? 0, w.episodeCount);
  return w.state === "watched" ? t.myWatch.watched : t.myWatch.started;
}

/** Esquina con ✓ si lo has visto entero; si lo has empezado, barra fina en el borde inferior del póster. */
function WatchMark({ watch }: { watch: MyWatch }) {
  const label = watchLabel(watch);
  // `dark`: el ámbar de Plex del tema oscuro se lee bien sobre cualquier póster, también con el tema claro.
  if (watch.state === "watched")
    return (
      // Esquina doblada arriba a la izquierda con un ✓ fino, a juego con la cinta.
      <span
        className="dark absolute left-0 top-0 h-7 w-7 overflow-hidden rounded-tl-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        title={label}
        aria-label={label}
        role="img"
      >
        <span className="absolute inset-0 bg-plex [clip-path:polygon(0_0,100%_0,0_100%)]" />
        <Check className="absolute left-[3px] top-[3px] h-3 w-3 text-[rgb(14_18_24)]" strokeWidth={3.5} aria-hidden />
      </span>
    );
  return (
    <span className="dark absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-black/60" title={label} aria-label={label} role="img">
      <span className="block h-full bg-plex" style={{ width: `${Math.max(6, watchProgress(watch) * 100)}%` }} />
    </span>
  );
}

export function PosterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-x-4 sm:gap-y-6">{children}</div>;
}
