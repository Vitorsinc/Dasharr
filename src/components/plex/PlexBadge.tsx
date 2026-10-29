import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ExternalLink, RefreshCw, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { findInPlex, isWatched, plex, plexWebUrl, type ExternalIds } from "@/api/plex";
import { usePlexIndex } from "@/hooks/usePlex";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { openExternal } from "@/lib/tauri";

/**
 * Estado en Plex de una película o serie de Radarr/Sonarr: si ya está, si se ha visto, y acciones rápidas.
 * No muestra nada si Plex no está configurado o no responde.
 */
export function PlexBadge({ ids, kind }: { ids: ExternalIds; kind: "movie" | "show" }) {
  const qc = useQueryClient();
  const index = usePlexIndex();
  if (index.configured !== true || !index.data) return null;
  const item = findInPlex(index.data, ids, kind);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["plex"] });
    } catch (e) {
      toast.error(errorMessage(e, "plex"));
    }
  };
  if (!item) {
    const sections = index.data.sections.filter((s) => s.type === kind);
    return (
      <div className="flex flex-wrap items-center gap-2" aria-label={t.services.plex}>
        <span className="chip bg-surface-2 text-muted">{t.plex.notInPlex}</span>
        {sections.length > 0 && (
          <button
            className="btn-ghost py-1 text-xs"
            onClick={() => run(() => Promise.all(sections.map((s) => plex.scanSection(s.key))), t.plex.scanStarted(sections.map((s) => s.title).join(", ")))}
          >
            <ScanSearch className="h-3.5 w-3.5" /> {t.plex.scanLibrary}
          </button>
        )}
      </div>
    );
  }
  const watched = isWatched(item);
  const machine = index.data.machineIdentifier;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t.services.plex}>
      <span className="chip bg-warning/15 text-warning">{t.plex.inPlex}</span>
      <span className="chip bg-surface-2 text-muted">
        {kind === "show" && item.leafCount ? t.plex.episodesWatched(item.viewedLeafCount ?? 0, item.leafCount) : watched ? t.plex.watched : t.plex.unwatched}
      </span>
      {machine && (
        <button className="btn-ghost py-1 text-xs" onClick={() => void openExternal(plexWebUrl(machine, item.ratingKey))}>
          <ExternalLink className="h-3.5 w-3.5" /> {t.plex.open}
        </button>
      )}
      <button
        className="btn-ghost py-1 text-xs"
        onClick={() => run(() => plex.setWatched(item.ratingKey, !watched), watched ? t.plex.markedUnwatched : t.plex.markedWatched)}
      >
        {watched ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {watched ? t.plex.markUnwatched : t.plex.markWatched}
      </button>
      <button className="btn-ghost py-1 text-xs" onClick={() => run(() => plex.refreshItem(item.ratingKey), t.plex.refreshStarted)}>
        <RefreshCw className="h-3.5 w-3.5" /> {t.plex.refreshMeta}
      </button>
    </div>
  );
}
