import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { findTorrents, type LibraryService } from "@/api/mediaTorrents";
import { MediaTorrents } from "./MediaTorrents";
import { Dialog } from "@/components/Dialog";
import type { DeleteOptions } from "@/api/arr";
import { useIsConfigured } from "@/hooks/useSettings";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";

/**
 * Confirmación para quitar películas o series de la biblioteca: borrar también los archivos y, si se da
 * `exclusionLabel`, añadirlas a las exclusiones de las listas de importación. Con qBittorrent configurado,
 * también quitar sus torrents (la casilla recuerda la última elección); con `lookup` se buscan al abrir y
 * se enseñan con su tracker, ratio, tiempo sembrado, etc.
 */
export function DeleteMediaDialog({
  open,
  onOpenChange,
  title,
  message,
  exclusionLabel,
  lookup,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message: string;
  exclusionLabel?: string;
  /** Qué películas o series se borran, para buscar sus torrents. */
  lookup?: { service: LibraryService; ids: number[] };
  onConfirm: (o: DeleteOptions) => void;
}) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [addExclusion, setAddExclusion] = useState(false);
  /** Torrents elegidos uno a uno cuando no se marca «quitar todos». */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [{ deleteTorrents }, setPrefs] = usePrefs();
  const hasQbit = useIsConfigured("qbittorrent") === true;
  const torrents = useQuery({
    queryKey: ["qbittorrent", "media-torrents", lookup?.service, lookup?.ids.join(",")],
    queryFn: () => findTorrents(lookup!.service, lookup!.ids),
    enabled: open && hasQbit && !!lookup?.ids.length,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (open) {
      setDeleteFiles(false);
      setAddExclusion(false);
      setPicked(new Set());
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted">{message}</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--danger))]"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
          />
          {t.common.deleteFiles}
        </label>
        {hasQbit && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--danger))]"
              checked={deleteTorrents}
              onChange={(e) => setPrefs({ deleteTorrents: e.target.checked })}
            />
            <span>
              {t.library.deleteTorrents}
              <span className="block text-xs text-muted">{t.library.deleteTorrentsHint}</span>
            </span>
          </label>
        )}
        {hasQbit && lookup && (
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
        )}
        {exclusionLabel && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={addExclusion} onChange={(e) => setAddExclusion(e.target.checked)} />
            {exclusionLabel}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              onConfirm({
                deleteFiles,
                addExclusion: !!exclusionLabel && addExclusion,
                deleteTorrents: hasQbit && (deleteTorrents || picked.size > 0),
                torrentHashes: deleteTorrents ? torrents.data?.map((tr) => tr.hash) : [...picked],
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
