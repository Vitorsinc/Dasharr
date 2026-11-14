import { useState } from "react";
import { Eye, EyeOff, FolderInput, Gauge, Tags, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Segmented } from "@/components/ui";
import { TagPicker } from "./TagPicker";
import { DeleteMediaDialog } from "./DeleteMediaDialog";
import type { ArrService, BulkEdit, DeleteOptions, QualityProfile, RootFolder } from "@/api/arr";
import { useTags } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";

type Open = "profile" | "tags" | "root" | "delete" | null;
type TagMode = NonNullable<BulkEdit["applyTags"]>;

function Footer({ busy, label, danger, onCancel, onApply }: { busy: boolean; label: string; danger?: boolean; onCancel: () => void; onApply: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button className="btn-ghost" onClick={onCancel}>
        {t.common.cancel}
      </button>
      <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onApply}>
        {label}
      </button>
    </div>
  );
}

/**
 * Barra de acciones del modo selección de la biblioteca: monitorizar, perfil, etiquetas, carpeta raíz
 * (moviendo los archivos, avisando antes) y borrar. `onApply`/`onDelete` resuelven si ha ido bien.
 */
export function BulkEditBar({
  service,
  count,
  visible,
  profiles,
  rootFolders,
  exclusionLabel,
  onSelectAll,
  onClear,
  onExit,
  onApply,
  onDelete,
}: {
  service: ArrService;
  count: number;
  /** Cuántas se ven con los filtros actuales (para «seleccionar las visibles»). */
  visible: number;
  profiles: QualityProfile[];
  rootFolders: RootFolder[];
  exclusionLabel?: string;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onApply: (e: BulkEdit) => Promise<boolean>;
  onDelete: (o: DeleteOptions) => Promise<boolean>;
}) {
  const tags = useTags(service);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState<number>(0);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>("add");
  const [root, setRoot] = useState("");
  const [moveFiles, setMoveFiles] = useState(true);
  const none = count === 0;

  async function apply(e: BulkEdit) {
    setBusy(true);
    const ok = await onApply(e);
    setBusy(false);
    if (ok) setOpen(null);
  }
  const show = (o: Open) => {
    setProfileId(profiles[0]?.id ?? 0);
    setTagIds([]);
    setTagMode("add");
    setRoot(rootFolders[0]?.path ?? "");
    setMoveFiles(true);
    setOpen(o);
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label={t.bulk.actions}
        className="card sticky bottom-4 z-10 flex flex-wrap items-center gap-2 px-4 py-2.5 shadow-xl"
      >
        <span className="text-sm font-medium" aria-live="polite">
          {t.bulk.count(count)}
        </span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onSelectAll}>
          {t.bulk.selectAll(visible)}
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" disabled={none} onClick={onClear}>
          {t.bulk.clear}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-outline" disabled={none || busy} onClick={() => void apply({ monitored: true })}>
            <Eye className="h-4 w-4" aria-hidden /> {t.bulk.monitor}
          </button>
          <button className="btn-outline" disabled={none || busy} onClick={() => void apply({ monitored: false })}>
            <EyeOff className="h-4 w-4" aria-hidden /> {t.bulk.unmonitor}
          </button>
          <button className="btn-outline" disabled={none} onClick={() => show("profile")}>
            <Gauge className="h-4 w-4" aria-hidden /> {t.bulk.profile}
          </button>
          <button className="btn-outline" disabled={none} onClick={() => show("tags")}>
            <Tags className="h-4 w-4" aria-hidden /> {t.bulk.tags}
          </button>
          <button className="btn-outline" disabled={none} onClick={() => show("root")}>
            <FolderInput className="h-4 w-4" aria-hidden /> {t.bulk.root}
          </button>
          <button className="btn-ghost text-danger" disabled={none} onClick={() => setOpen("delete")}>
            <Trash2 className="h-4 w-4" aria-hidden /> {t.bulk.delete}
          </button>
          <button className="btn-ghost" onClick={onExit} aria-label={t.bulk.done} title={t.bulk.done}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <Dialog open={open === "profile"} onOpenChange={(o) => !o && setOpen(null)} title={t.bulk.profileTitle(count)}>
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
          <Footer busy={busy || !profileId} label={t.bulk.apply} onCancel={() => setOpen(null)} onApply={() => void apply({ qualityProfileId: profileId })} />
        </div>
      </Dialog>

      <Dialog open={open === "tags"} onOpenChange={(o) => !o && setOpen(null)} title={t.bulk.tagsTitle(count)}>
        <div className="flex flex-col gap-4">
          <TagPicker tags={tags.data ?? []} value={tagIds} onChange={setTagIds} />
          <div>
            <span className="label">{t.bulk.tagsMode}</span>
            <Segmented<TagMode>
              label={t.bulk.tagsMode}
              value={tagMode}
              onChange={setTagMode}
              options={[
                { value: "add", label: t.bulk.tagsAdd },
                { value: "remove", label: t.bulk.tagsRemove },
                { value: "replace", label: t.bulk.tagsReplace },
              ]}
            />
            {tagMode === "replace" && <p className="mt-1 text-xs text-warning">{t.bulk.tagsReplaceHint}</p>}
          </div>
          <Footer
            busy={busy || (tagMode !== "replace" && !tagIds.length)}
            label={t.bulk.apply}
            onCancel={() => setOpen(null)}
            onApply={() => void apply({ tags: tagIds, applyTags: tagMode })}
          />
        </div>
      </Dialog>

      <Dialog open={open === "root"} onOpenChange={(o) => !o && setOpen(null)} title={t.bulk.rootTitle(count)}>
        <div className="flex flex-col gap-4">
          <label>
            <span className="label">{t.library.rootFolder}</span>
            <select className="input" value={root} onChange={(e) => setRoot(e.target.value)}>
              {rootFolders.map((r) => (
                <option key={r.id} value={r.path}>
                  {r.path}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={moveFiles} onChange={(e) => setMoveFiles(e.target.checked)} />
            {t.bulk.moveFiles}
          </label>
          <p className={moveFiles ? "text-sm text-warning" : "text-sm text-muted"} role="note">
            {moveFiles ? t.bulk.moveWarning(count, root) : t.bulk.noMoveHint}
          </p>
          <Footer
            busy={busy || !root}
            danger={moveFiles}
            label={moveFiles ? t.bulk.move(count) : t.bulk.apply}
            onCancel={() => setOpen(null)}
            onApply={() => void apply({ rootFolderPath: root, moveFiles })}
          />
        </div>
      </Dialog>

      <DeleteMediaDialog
        open={open === "delete"}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t.bulk.deleteTitle(count)}
        message={t.bulk.deleteMessage(count)}
        exclusionLabel={exclusionLabel}
        onConfirm={(o) => void onDelete(o)}
      />
    </>
  );
}
