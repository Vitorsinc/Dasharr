import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { findSeasonTorrents } from "@/api/mediaTorrents";
import { MediaTorrents } from "./MediaTorrents";
import { Dialog } from "@/components/Dialog";
import { useIsConfigured } from "@/hooks/useSettings";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";

export interface DeleteSeasonOptions {
  unmonitor: boolean;
  /** Hashes de qBittorrent que se quitan con lo descargado (vacío: ninguno; sin definir: buscarlos al borrar). */
  torrentHashes?: string[];
}

/**
 * Confirmación para borrar del disco todos los capítulos de una temporada. Ofrece dejar de monitorizarla
 * (para que Sonarr no los vuelva a bajar) y, con qBittorrent, quitar los torrents de esa temporada como
 * al borrar una serie (misma casilla recordada).
 */
export function DeleteSeasonDialog({
  open,
  onOpenChange,
  title,
  message,
  seriesId,
  season,
  monitored,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message: string;
  seriesId: number;
  season: number;
  monitored: boolean;
  onConfirm: (o: DeleteSeasonOptions) => void;
}) {
  const [unmonitor, setUnmonitor] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [{ deleteTorrents }, setPrefs] = usePrefs();
  const hasQbit = useIsConfigured("qbittorrent") === true;
  const torrents = useQuery({
    queryKey: ["qbittorrent", "season-torrents", seriesId, season],
    queryFn: () => findSeasonTorrents(seriesId, season),
    enabled: open && hasQbit,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (open) {
      setUnmonitor(true);
      setPicked(new Set());
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted">{message}</div>
        {monitored && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={unmonitor} onChange={(e) => setUnmonitor(e.target.checked)} />
            <span>
              {t.seriesTools.deleteSeasonUnmonitor}
              <span className="block text-xs text-muted">{t.seriesTools.deleteSeasonUnmonitorHint}</span>
            </span>
          </label>
        )}
        {hasQbit && (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--danger))]"
                checked={deleteTorrents}
                onChange={(e) => setPrefs({ deleteTorrents: e.target.checked })}
              />
              <span>
                {t.library.deleteTorrents}
                <span className="block text-xs text-muted">{t.seriesTools.seasonTorrentsHint}</span>
              </span>
            </label>
            <div className="pl-6">
              <MediaTorrents
                q={torrents}
                picked={picked}
                locked={deleteTorrents}
                onPick={(hash, on) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(hash);
                    else next.delete(hash);
                    return next;
                  })
                }
              />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              onConfirm({
                unmonitor: monitored && unmonitor,
                torrentHashes: !hasQbit ? [] : deleteTorrents ? torrents.data?.map((tr) => tr.hash) : [...picked],
              });
              onOpenChange(false);
            }}
          >
            {t.common.delete}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
