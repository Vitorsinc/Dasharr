import { Search, User } from "lucide-react";
import { t } from "@/i18n/es";

/**
 * Las dos búsquedas juntas, como en Radarr/Sonarr: automática (el *arr elige y descarga)
 * o manual (lista las releases para elegir). Versión compacta para filas de temporada y episodio.
 */
export function SearchChoice({ what, onAuto, onManual }: { what: string; onAuto: () => void; onManual: () => void }) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border text-xs font-medium" role="group" aria-label={`${t.library.searchFor} ${what}`}>
      <button
        className="flex items-center gap-1 px-2 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        title={t.library.searchAutoHint}
        aria-label={`${t.library.searchAuto}: ${what}`}
        onClick={onAuto}
      >
        <Search className="h-3.5 w-3.5" /> {t.library.searchAutoShort}
      </button>
      <button
        className="flex items-center gap-1 border-l border-border px-2 py-1 text-accent transition-colors hover:bg-accent/10"
        title={t.releases.manualHint}
        aria-label={`${t.releases.manual}: ${what}`}
        onClick={onManual}
      >
        <User className="h-3.5 w-3.5" /> {t.releases.manualShort}
      </button>
    </div>
  );
}
