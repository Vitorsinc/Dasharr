import { Bookmark } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import type { Series } from "@/api/sonarr";

/** Marcador relleno = monitorizado, vacío = no monitorizado, como en Radarr/Sonarr. */
export function MonitorIcon({ monitored, className }: { monitored: boolean; className?: string }) {
  return <Bookmark className={cn("h-4 w-4", !monitored && "text-muted", className)} fill={monitored ? "currentColor" : "none"} />;
}

/** Estado que pinta la cinta: el color dice si está descargada, descargándose, incompleta o si falta. */
export type RibbonState = "downloaded" | "downloading" | "partial" | "missing" | "none";

const ribbonColor: Record<RibbonState, string> = {
  downloaded: "text-[rgb(34_197_94)]", // verde
  downloading: "text-[rgb(56_189_248)]", // azul cielo
  partial: "text-[rgb(245_158_11)]", // ámbar
  missing: "text-[rgb(239_68_68)]", // rojo
  none: "text-[rgb(148_163_184)]", // gris
};

/**
 * Cómo se ve la cinta sin monitorizar: "rolled" = recogida hacia arriba (cae al monitorizar);
 * "faded" = largo normal, apagada y semitransparente.
 */
const UNMONITORED_STYLE: "rolled" | "faded" = "rolled";

/** Estado de la cinta de una serie según sus episodios con archivo (sin episodios emitidos: gris). */
export function seriesRibbon(s: Series): RibbonState {
  const have = s.statistics?.episodeFileCount ?? 0;
  const total = s.statistics?.episodeCount ?? 0;
  if (total === 0) return "none";
  if (have >= total) return "downloaded";
  if (have > 0) return "partial";
  return s.monitored ? "missing" : "none";
}

export const ribbonLabel: Record<RibbonState, string> = {
  downloaded: t.library.statusDownloaded,
  downloading: t.downloads.state.downloading,
  partial: t.library.statusPartial,
  missing: t.library.statusMissing,
  none: t.library.statusUnmonitored,
};

/**
 * Cinta que cuelga del borde superior del póster, con muesca en V abajo.
 * Rellena = monitorizada; hueca con borde discontinuo = sin monitorizar. El color, el estado de los archivos.
 */
export function MonitorRibbon({ monitored, state, className }: { monitored: boolean; state: RibbonState; className?: string }) {
  const rolled = !monitored && UNMONITORED_STYLE === "rolled";
  const faded = !monitored && UNMONITORED_STYLE === "faded";
  return (
    <svg
      viewBox="0 0 24 30"
      className={cn(
        "h-[1.875rem] w-6 origin-top drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out",
        ribbonColor[state],
        faded && "saturate-[.4]",
        rolled && "scale-y-[.4]",
        className,
      )}
      aria-hidden
    >
      <path d="M0 0h24v30l-12-7-12 7z" fill="currentColor" fillOpacity={faded ? 0.4 : 1} stroke={faded ? "currentColor" : "none"} strokeWidth="1.5" />
      {!faded && <path d="M0 0h6v26.5l-6 3.5z" fill="white" opacity="0.2" />}
      <path d="M0 0h24v2.5H0z" fill="black" opacity="0.25" />
    </svg>
  );
}

/** Cinta de monitorización sobre el póster, en el borde derecho: pulsarla la activa o desactiva. */
export function PosterMonitorToggle({
  monitored,
  state,
  what,
  onToggle,
  className,
}: {
  monitored: boolean;
  state: RibbonState;
  /** Título, para que el lector de pantalla sepa de qué ficha es en el catálogo. */
  what?: string;
  onToggle: () => void;
  className?: string;
}) {
  const label = monitored ? t.library.monitorOff : t.library.monitorOn;
  const status = state === "none" ? ribbonLabel.none : `${ribbonLabel[state]}${monitored ? "" : ` · ${t.library.statusUnmonitored}`}`;
  return (
    <button
      className={cn("absolute right-2.5 top-0 z-10 origin-top transition-transform hover:scale-y-110", className)}
      title={`${status} — ${label}`}
      aria-label={what ? `${label}: ${what}` : label}
      aria-pressed={monitored}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <MonitorRibbon monitored={monitored} state={state} />
    </button>
  );
}

/** Botón compacto para cambiar la monitorización (filas de episodio). */
export function MonitorToggle({ monitored, what, onToggle }: { monitored: boolean; what: string; onToggle: () => void }) {
  const label = monitored ? t.library.monitoredClick : t.library.unmonitoredClick;
  return (
    <button className="btn-ghost shrink-0 p-1" title={label} aria-label={`${label}: ${what}`} aria-pressed={monitored} onClick={onToggle}>
      <MonitorIcon monitored={monitored} />
    </button>
  );
}
