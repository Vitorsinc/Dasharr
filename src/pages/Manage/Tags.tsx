import { useState } from "react";
import { Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrManage, type TagDetail } from "@/api/arrManage";
import { useRun, useTagDetails } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";

/** Cuántas cosas de la biblioteca y de los ajustes llevan la etiqueta. */
export function tagUsage(d: TagDetail) {
  const items = (d.movieIds?.length ?? 0) + (d.seriesIds?.length ?? 0);
  const other = [d.delayProfileIds, d.importListIds, d.notificationIds, d.indexerIds, d.downloadClientIds, d.restrictionIds, d.autoTagIds].reduce(
    (n, l) => n + (l?.length ?? 0),
    0,
  );
  return { items, other };
}

function RenameDialog({ tag, onSave, onClose }: { tag: TagDetail; onSave: (label: string) => Promise<boolean>; onClose: () => void }) {
  const [label, setLabel] = useState(tag.label);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.manage.tags.rename(tag.label)}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (label.trim() && (await onSave(label.trim()))) onClose();
        }}
      >
        <label>
          <span className="label">{t.common.name}</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={!label.trim()}>
            {t.common.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function Tags({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useTagDetails(service);
  const run = useRun(service);
  const [label, setLabel] = useState("");
  const [renaming, setRenaming] = useState<TagDetail | null>(null);
  const [deleting, setDeleting] = useState<TagDetail | null>(null);
  const list = [...(q.data ?? [])].sort((a, b) => a.label.localeCompare(b.label));
  const keys = [[service, "tags"], [service, "movies"], [service, "series"]];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.manage.tags.hint}</p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const l = label.trim();
          if (l && (await run(() => api.createTag(l), t.manage.tags.created(l), keys))) setLabel("");
        }}
      >
        <input
          className="input max-w-xs"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.manage.tags.new}
          aria-label={t.manage.tags.new}
        />
        <button type="submit" className="btn-primary" disabled={!label.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> {t.manage.tags.add}
        </button>
      </form>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty>{t.manage.tags.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.tags}>
          {list.map((tag) => {
            const u = tagUsage(tag);
            return (
              <li key={tag.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <TagIcon className="h-4 w-4 text-muted" aria-hidden />
                <span className="font-medium">{tag.label}</span>
                <span className="flex-1 text-xs text-muted">{t.manage.tags.usage(u.items, u.other)}</span>
                <button className="btn-ghost p-1.5" aria-label={t.manage.tags.rename(tag.label)} title={t.common.edit} onClick={() => setRenaming(tag)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  className="btn-ghost p-1.5 text-muted hover:text-danger"
                  aria-label={`${t.common.delete}: ${tag.label}`}
                  title={t.common.delete}
                  onClick={() => setDeleting(tag)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {renaming && (
        <RenameDialog
          tag={renaming}
          onClose={() => setRenaming(null)}
          onSave={(l) => run(() => api.updateTag({ id: renaming.id, label: l }), t.manage.tags.renamed, keys)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.tags.deleteTitle}
        message={deleting ? t.manage.tags.deleteMessage(deleting.label) : ""}
        onConfirm={() => deleting && run(() => api.deleteTag(deleting.id), t.manage.tags.deleted, keys)}
      />
    </div>
  );
}
