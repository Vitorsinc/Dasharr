import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { movePath, type QualityProfile, type RootFolder } from "@/api/arr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";

export interface EditValues {
  qualityProfileId: number;
  path: string;
  moveFiles: boolean;
}

/**
 * Editar una película o serie ya añadida: perfil de calidad y carpeta (con opción de mover los archivos),
 * más los campos propios de cada *arr en `extra`.
 */
export function EditMediaDialog({
  title,
  profiles,
  rootFolders,
  initial,
  extra,
  onSave,
  onClose,
}: {
  title: string;
  profiles: QualityProfile[];
  rootFolders: RootFolder[];
  initial: { qualityProfileId?: number; path?: string; rootFolderPath?: string };
  extra?: ReactNode;
  onSave: (v: EditValues) => Promise<unknown>;
  onClose: () => void;
}) {
  const [profileId, setProfileId] = useState(initial.qualityProfileId ?? profiles[0]?.id ?? 0);
  const currentRoot =
    initial.rootFolderPath?.replace(/[\\/]+$/, "") ??
    rootFolders.find((r) => initial.path?.startsWith(r.path))?.path.replace(/[\\/]+$/, "") ??
    "";
  const [root, setRoot] = useState(currentRoot);
  const [moveFiles, setMoveFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const path = initial.path && root && root !== currentRoot ? movePath(initial.path, root) : (initial.path ?? "");
  const roots = rootFolders.map((r) => r.path.replace(/[\\/]+$/, ""));
  if (currentRoot && !roots.includes(currentRoot)) roots.unshift(currentRoot);
  async function save() {
    setBusy(true);
    try {
      await onSave({ qualityProfileId: profileId, path, moveFiles });
      toast.success(t.editMedia.saved);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title}>
      <div className="flex flex-col gap-4">
        <label>
          <span className="label">{t.library.qualityProfile}</span>
          <select className="input" value={profileId} onChange={(e) => setProfileId(Number(e.target.value))}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {extra}
        <div>
          <label>
            <span className="label">{t.library.rootFolder}</span>
            <select className="input" value={root} onChange={(e) => setRoot(e.target.value)}>
              {roots.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {path && <span className="mt-1 block break-all font-mono text-xs text-muted">{path}</span>}
        </div>
        {path !== initial.path && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={moveFiles} onChange={(e) => setMoveFiles(e.target.checked)} />
            {t.editMedia.moveFiles}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || !profileId} onClick={save}>
            {t.editMedia.save}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
