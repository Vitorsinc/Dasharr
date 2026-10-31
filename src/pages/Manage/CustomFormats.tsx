import { useState } from "react";
import { FileJson, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrManage, customFormatToJson, parseCustomFormatJson, type CustomFormat } from "@/api/arrManage";
import { useCustomFormats, useQualityProfiles, useRun } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";

/** Crear (importando) o editar un formato como JSON, que es como se comparten (guías TRaSH, exportar de la web). */
function FormatDialog({ service, format, onClose }: { service: ArrService; format: CustomFormat | null; onClose: () => void }) {
  const api = arrManage(service);
  const run = useRun(service);
  const [text, setText] = useState(format ? customFormatToJson(format) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    let parsed;
    try {
      parsed = parseCustomFormatJson(text);
    } catch (e) {
      setError(t.manage.formats.errors[(e as Error).message] ?? (e as Error).message);
      return;
    }
    setError(null);
    setBusy(true);
    const ok = await run(
      () => (format ? api.updateCustomFormat({ ...parsed, id: format.id }) : api.createCustomFormat(parsed)),
      format ? t.manage.formats.saved : t.manage.formats.created,
      // Un formato nuevo aparece (con 0 puntos) en todos los perfiles.
      [
        [service, "customformats"],
        [service, "profiles"],
      ],
    );
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={format ? t.manage.formats.edit(format.name) : t.manage.formats.importTitle} wide>
      <div className="flex flex-col gap-3">
        {!format && <p className="text-sm text-muted">{t.manage.formats.importHint}</p>}
        <label>
          <span className="label">{t.manage.formats.json}</span>
          <textarea
            className="input h-80 font-mono text-xs"
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || !text.trim()} onClick={save}>
            {t.common.save}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function CustomFormats({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useCustomFormats(service);
  const profiles = useQualityProfiles(service);
  const run = useRun(service);
  const [editing, setEditing] = useState<CustomFormat | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomFormat | null>(null);
  const list = [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  /** En cuántos perfiles puntúa (puntuación distinta de 0). */
  const usedIn = (id: number) => (profiles.data ?? []).filter((p) => p.formatItems?.some((f) => f.format === id && f.score !== 0)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t.manage.formats.hint}</p>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <FileJson className="h-4 w-4" aria-hidden /> {t.manage.formats.import}
        </button>
      </div>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty>{t.manage.formats.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.formats}>
          {list.map((cf) => (
            <li key={cf.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{cf.name}</div>
                <div className="truncate text-xs text-muted" title={cf.specifications.map((s) => s.name).join(", ")}>
                  {t.manage.formats.specs(cf.specifications.length)} · {t.manage.formats.usedIn(usedIn(cf.id))}
                </div>
              </div>
              <button className="btn-ghost p-1.5" aria-label={t.manage.formats.edit(cf.name)} title={t.common.edit} onClick={() => setEditing(cf)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
              <button
                className="btn-ghost p-1.5 text-muted hover:text-danger"
                aria-label={`${t.common.delete}: ${cf.name}`}
                title={t.common.delete}
                onClick={() => setDeleting(cf)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <FormatDialog service={service} format={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.formats.deleteTitle}
        message={deleting ? t.manage.formats.deleteMessage(deleting.name) : ""}
        onConfirm={() =>
          deleting &&
          run(() => api.deleteCustomFormat(deleting.id), t.manage.formats.deleted, [
            [service, "customformats"],
            [service, "profiles"],
          ])
        }
      />
    </div>
  );
}
