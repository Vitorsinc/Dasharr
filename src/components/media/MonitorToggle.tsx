import { Bookmark } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

/** Marcador relleno = monitorizado, vacío = no monitorizado, como en Radarr/Sonarr. */
export function MonitorIcon({ monitored, className }: { monitored: boolean; className?: string }) {
  return <Bookmark className={cn("h-4 w-4", !monitored && "text-muted", className)} fill={monitored ? "currentColor" : "none"} />;
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
