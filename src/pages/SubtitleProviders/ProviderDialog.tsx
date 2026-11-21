import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ProviderFields } from "@/components/ProviderFields";
import { Spinner } from "@/components/ui";
import { bazarr, type BazarrSettings } from "@/api/bazarr";
import { useRun } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";
import { enabledProviders, initialValues, toFormFields, validateValues, type ProviderRow } from "@/lib/bazarrProviders";

/** Ajustes de un proveedor. Si aún no está activo, guardar también lo activa. */
export function ProviderDialog({ row, settings, onClose }: { row: ProviderRow; settings: BazarrSettings | undefined; onClose: () => void }) {
  const run = useRun("bazarr");
  const [values, setValues] = useState(() => initialValues(row.fields, settings?.[row.key]));
  const [busy, setBusy] = useState(false);
  const invalid = validateValues(row.fields, values);
  const enabled = enabledProviders(settings);

  async function save() {
    setBusy(true);
    const ok = await run(
      () => bazarr.saveProvider(row.key, values, row.enabled ? undefined : [...enabled, row.key]),
      row.enabled ? t.subProviders.saved(row.name) : t.subProviders.toggled(row.name, true),
      [["bazarr", "provider-settings"], ["bazarr", "provider-status"]],
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.subProviders.edit(row.name)}>
      <div className="flex flex-col gap-4">
        {row.description && <p className="text-sm text-muted">{row.description}</p>}
        {row.fields.length ? (
          <ProviderFields
            idPrefix={`bz-${row.key}`}
            fields={toFormFields(row.fields, values)}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
          />
        ) : (
          <p className="text-sm text-muted">{t.subProviders.noFields}</p>
        )}
        {row.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{row.note}</p>}
        {row.anidb && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{t.subProviders.anidb}</p>}
        {invalid && (
          <p role="alert" className="text-sm text-danger">
            {invalid}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || !!invalid} onClick={save}>
            {busy && <Spinner className="h-4 w-4" />}
            {row.enabled ? t.common.save : t.subProviders.saveAndEnable}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
