import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { DeleteOptions } from "@/api/arr";
import { t } from "@/i18n/es";

/**
 * Confirmación para quitar películas o series de la biblioteca: borrar también los archivos y, si se da
 * `exclusionLabel`, añadirlas a las exclusiones de las listas de importación.
 */
export function DeleteMediaDialog({
  open,
  onOpenChange,
  title,
  message,
  exclusionLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message: string;
  exclusionLabel?: string;
  onConfirm: (o: DeleteOptions) => void;
}) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [addExclusion, setAddExclusion] = useState(false);
  useEffect(() => {
    if (open) {
      setDeleteFiles(false);
      setAddExclusion(false);
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
              onConfirm({ deleteFiles, addExclusion: !!exclusionLabel && addExclusion });
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
