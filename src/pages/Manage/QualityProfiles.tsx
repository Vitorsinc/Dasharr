import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, NumberInput, Toggle } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrManage, type QualityProfileFull } from "@/api/arrManage";
import { useQualityProfiles, useRun } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";
import { arrErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";
import {
  allowedItems,
  groupMembers,
  itemKey,
  itemName,
  moveItem,
  profileProblems,
  setAllowed,
  setFormatScore,
} from "@/lib/qualityProfile";

/** Editor de un perfil de calidad: nombre, mejora y su límite, calidades permitidas y su orden, y puntuaciones. */
export function ProfileEditor({
  service,
  initial,
  isNew,
  onClose,
}: {
  service: ArrService;
  initial: QualityProfileFull;
  isNew: boolean;
  onClose: () => void;
}) {
  const api = arrManage(service);
  const run = useRun(service);
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const problems = profileProblems(p);
  const allowed = allowedItems(p);
  const shown = [...p.items].reverse();

  async function save() {
    setBusy(true);
    const ok = await run(
      () => (isNew ? api.createQualityProfile(p) : api.updateQualityProfile(p)),
      isNew ? t.manage.profiles.created : t.manage.profiles.saved,
      // Los perfiles se ven en la biblioteca, al añadir y en Ajustes → Contenido.
      [[service, "profiles"]],
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isNew ? t.manage.profiles.create : t.manage.profiles.edit(initial.name)} wide>
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">{t.common.name}</span>
            <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </label>
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm">{t.manage.profiles.upgradeAllowed}</span>
              <span className="block text-xs text-muted">{t.manage.profiles.upgradeAllowedHint}</span>
            </span>
            <Toggle label={t.manage.profiles.upgradeAllowed} checked={p.upgradeAllowed} onChange={(v) => setP({ ...p, upgradeAllowed: v })} />
          </div>
          {p.upgradeAllowed && (
            <label>
              <span className="label">{t.manage.profiles.cutoff}</span>
              <select className="input" aria-label={t.manage.profiles.cutoff} value={p.cutoff} onChange={(e) => setP({ ...p, cutoff: Number(e.target.value) })}>
                {allowed.map((i) => (
                  <option key={itemKey(i)} value={itemKey(i)}>
                    {itemName(i)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">{t.manage.profiles.cutoffHint}</span>
            </label>
          )}
        </div>

        <section className="flex flex-col gap-2" aria-label={t.manage.profiles.qualities}>
          <div>
            <h3 className="text-sm font-semibold">{t.manage.profiles.qualities}</h3>
            <p className="text-xs text-muted">{t.manage.profiles.qualitiesHint}</p>
          </div>
          <ul className="card max-h-72 divide-y divide-border overflow-y-auto">
            {shown.map((item, idx) => {
              const key = itemKey(item);
              const name = itemName(item);
              const members = groupMembers(item);
              return (
                <li key={key} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={item.allowed}
                    onChange={(e) => setP(setAllowed(p, key, e.target.checked))}
                    aria-label={t.manage.profiles.allowed(name)}
                  />
                  <div className={cn("min-w-0 flex-1", !item.allowed && "text-muted")}>
                    <span>{name}</span>
                    {members.length > 0 && <span className="ml-2 text-xs text-muted">{members.join(", ")}</span>}
                  </div>
                  <button
                    className="btn-ghost p-1"
                    disabled={idx === 0}
                    aria-label={t.manage.profiles.moveUp(name)}
                    onClick={() => setP(moveItem(p, key, -1))}
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    className="btn-ghost p-1"
                    disabled={idx === shown.length - 1}
                    aria-label={t.manage.profiles.moveDown(name)}
                    onClick={() => setP(moveItem(p, key, 1))}
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2" aria-label={t.manage.profiles.formats}>
          <div>
            <h3 className="text-sm font-semibold">{t.manage.profiles.formats}</h3>
            <p className="text-xs text-muted">{t.manage.profiles.formatsHint}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">{t.manage.profiles.minScore}</span>
              <NumberInput className="input" value={p.minFormatScore} onValue={(n) => setP({ ...p, minFormatScore: n })} />
            </label>
            {p.upgradeAllowed && (
              <label>
                <span className="label">{t.manage.profiles.cutoffScore}</span>
                <NumberInput className="input" value={p.cutoffFormatScore} onValue={(n) => setP({ ...p, cutoffFormatScore: n })} />
              </label>
            )}
          </div>
          {!p.formatItems.length ? (
            <p className="text-sm text-muted">{t.manage.profiles.noFormats}</p>
          ) : (
            <ul className="card max-h-60 divide-y divide-border overflow-y-auto">
              {[...p.formatItems]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((f) => (
                  <li key={f.format} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className={cn("flex-1", f.score === 0 && "text-muted")}>{f.name}</span>
                    <NumberInput
                      className="input w-24 py-1 text-right"
                      value={f.score}
                      aria-label={t.manage.profiles.score(f.name)}
                      onValue={(n) => setP((cur) => setFormatScore(cur, f.format, n))}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>

        {problems.length > 0 && (
          <ul className="text-sm text-danger" role="alert">
            {problems.map((x) => (
              <li key={x}>{t.manage.profiles.problems[x]}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || problems.length > 0} onClick={save}>
            {t.common.save}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function QualityProfiles({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useQualityProfiles(service);
  const run = useRun(service);
  const [editing, setEditing] = useState<{ profile: QualityProfileFull; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<QualityProfileFull | null>(null);
  const [creating, setCreating] = useState(false);

  async function startNew() {
    setCreating(true);
    try {
      const schema = await api.getQualityProfileSchema();
      setEditing({ profile: { ...schema, name: t.manage.profiles.newName }, isNew: true });
    } catch (e) {
      toast.error(arrErrorMessage(e, service));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t.manage.profiles.hint}</p>
        <button className="btn-primary" disabled={creating} onClick={startNew}>
          <Plus className="h-4 w-4" aria-hidden /> {t.manage.profiles.new}
        </button>
      </div>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Empty>{t.manage.profiles.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.profiles}>
          {q.data.map((p) => {
            const ok = allowedItems(p);
            const cutoff = ok.find((i) => itemKey(i) === p.cutoff);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted" title={ok.map(itemName).join(", ")}>
                    {t.manage.profiles.allowedCount(ok.length)} ·{" "}
                    {p.upgradeAllowed && cutoff ? t.manage.profiles.upgradesTo(itemName(cutoff)) : t.manage.profiles.noUpgrades}
                  </div>
                </div>
                <button
                  className="btn-ghost p-1.5"
                  aria-label={t.manage.profiles.edit(p.name)}
                  title={t.common.edit}
                  onClick={() => setEditing({ profile: p, isNew: false })}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  className="btn-ghost p-1.5 text-muted hover:text-danger"
                  aria-label={`${t.common.delete}: ${p.name}`}
                  title={t.common.delete}
                  onClick={() => setDeleting(p)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <ProfileEditor service={service} initial={editing.profile} isNew={editing.isNew} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.profiles.deleteTitle}
        message={deleting ? t.manage.profiles.deleteMessage(deleting.name) : ""}
        onConfirm={() => deleting && run(() => api.deleteQualityProfile(deleting.id), t.manage.profiles.deleted, [[service, "profiles"]])}
      />
    </div>
  );
}
