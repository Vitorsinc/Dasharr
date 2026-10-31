import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, NumberInput, Segmented } from "@/components/ui";
import { TagPicker } from "@/components/media/TagPicker";
import type { ArrService } from "@/api/arr";
import { arrManage, DEFAULT_DELAY_PROFILE_ID, type DelayProfile } from "@/api/arrManage";
import { useDelayProfiles, useRun, useTags } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";

const NEW: Omit<DelayProfile, "id"> = {
  enableUsenet: true,
  enableTorrent: true,
  preferredProtocol: "usenet",
  usenetDelay: 0,
  torrentDelay: 0,
  bypassIfHighestQuality: true,
  bypassIfAboveCustomFormatScore: false,
  minimumCustomFormatScore: 0,
  order: 0,
  tags: [],
};

const isDefault = (p: Pick<DelayProfile, "id">) => p.id === DEFAULT_DELAY_PROFILE_ID;

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function DelayDialog({ service, initial, onClose }: { service: ArrService; initial: DelayProfile | null; onClose: () => void }) {
  const api = arrManage(service);
  const run = useRun(service);
  const tags = useTags(service);
  const [p, setP] = useState<Omit<DelayProfile, "id"> & { id?: number }>(initial ?? NEW);
  const [busy, setBusy] = useState(false);
  const needTags = !(initial && isDefault(initial)) && p.tags.length === 0;
  async function save() {
    setBusy(true);
    const ok = await run(
      () => (initial ? api.updateDelayProfile({ ...(p as DelayProfile), id: initial.id }) : api.createDelayProfile(p)),
      initial ? t.manage.delay.saved : t.manage.delay.created,
      [[service, "delayprofiles"], [service, "tags"]],
    );
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={initial ? t.manage.delay.edit : t.manage.delay.add}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <Check label={t.manage.delay.enableUsenet} checked={p.enableUsenet} onChange={(v) => setP({ ...p, enableUsenet: v })} />
          <Check label={t.manage.delay.enableTorrent} checked={p.enableTorrent} onChange={(v) => setP({ ...p, enableTorrent: v })} />
        </div>
        <div>
          <span className="label">{t.manage.delay.preferred}</span>
          <Segmented<DelayProfile["preferredProtocol"]>
            label={t.manage.delay.preferred}
            value={p.preferredProtocol}
            onChange={(v) => setP({ ...p, preferredProtocol: v })}
            options={[
              { value: "usenet", label: t.manage.delay.usenet },
              { value: "torrent", label: t.manage.delay.torrent },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{t.manage.delay.usenetDelay}</span>
            <NumberInput className="input" min={0} value={p.usenetDelay} onValue={(n) => setP({ ...p, usenetDelay: Math.max(0, n) })} />
          </label>
          <label>
            <span className="label">{t.manage.delay.torrentDelay}</span>
            <NumberInput className="input" min={0} value={p.torrentDelay} onValue={(n) => setP({ ...p, torrentDelay: Math.max(0, n) })} />
          </label>
        </div>
        <Check label={t.manage.delay.bypass} checked={p.bypassIfHighestQuality} onChange={(v) => setP({ ...p, bypassIfHighestQuality: v })} />
        {!(initial && isDefault(initial)) && (
          <div>
            <span className="label">{t.manage.delay.tags}</span>
            <TagPicker tags={tags.data ?? []} value={p.tags} onChange={(v) => setP({ ...p, tags: v })} />
            {needTags && <p className="mt-1 text-xs text-warning">{t.manage.delay.needTags}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || needTags || (!p.enableUsenet && !p.enableTorrent)} onClick={save}>
            {t.common.save}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function DelayProfiles({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useDelayProfiles(service);
  const tags = useTags(service);
  const run = useRun(service);
  const [editing, setEditing] = useState<DelayProfile | "new" | null>(null);
  const [deleting, setDeleting] = useState<DelayProfile | null>(null);
  const tagName = new Map((tags.data ?? []).map((x) => [x.id, x.label]));
  const list = [...(q.data ?? [])].sort((a, b) => a.order - b.order);
  const protocols = (p: DelayProfile) =>
    [
      p.enableUsenet && `${t.manage.delay.usenet}: ${t.manage.delay.minutes(p.usenetDelay)}`,
      p.enableTorrent && `${t.manage.delay.torrent}: ${t.manage.delay.minutes(p.torrentDelay)}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t.manage.delay.hint}</p>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden /> {t.manage.delay.add}
        </button>
      </div>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty>{t.manage.delay.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.delay}>
          {list.map((p) => {
            const name = isDefault(p) ? t.manage.delay.default : p.tags.map((id) => tagName.get(id) ?? `#${id}`).join(", ");
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-muted">
                    {t.manage.delay[p.preferredProtocol]} · {protocols(p)}
                  </div>
                </div>
                <button className="btn-ghost p-1.5" aria-label={`${t.manage.delay.edit}: ${name}`} title={t.common.edit} onClick={() => setEditing(p)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                {!isDefault(p) && (
                  <button
                    className="btn-ghost p-1.5 text-muted hover:text-danger"
                    aria-label={`${t.common.delete}: ${name}`}
                    title={t.common.delete}
                    onClick={() => setDeleting(p)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <DelayDialog service={service} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.delay.deleteTitle}
        message={t.manage.delay.deleteMessage}
        onConfirm={() => deleting && run(() => api.deleteDelayProfile(deleting.id), t.manage.delay.deleted, [[service, "delayprofiles"]])}
      />
    </div>
  );
}
