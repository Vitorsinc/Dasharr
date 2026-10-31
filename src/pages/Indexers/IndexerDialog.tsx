import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { ProviderFields } from "@/components/ProviderFields";
import { NumberInput, Spinner, Toggle } from "@/components/ui";
import { prowlarr, testFailure, type IndexerFull } from "@/api/prowlarr";
import { useRun } from "@/hooks/useArrManage";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { hasAdvanced, setFieldValue, visibleFields } from "@/lib/providerFields";

const SHOWN = 100;
const DEFAULT_PRIORITY = 25;

/** Paso 1 de «Añadir»: elegir la definición del indexador de la lista de Prowlarr. */
function SchemaPicker({ onPick }: { onPick: (s: IndexerFull) => void }) {
  const schema = useServiceQuery("prowlarr", ["indexer-schema"], prowlarr.getSchema, { staleTime: 60 * 60_000 });
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(schema.data ?? [])]
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schema.data, query]);
  if (schema.isLoading)
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
        <Spinner /> {t.indexers.loadingSchema}
      </div>
    );
  if (schema.isError) return <ErrorPanel service="prowlarr" error={schema.error} onRetry={() => schema.refetch()} compact />;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          className="input pl-9"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.indexers.pick}
          aria-label={t.indexers.pick}
        />
      </div>
      <p className="text-xs text-muted">
        {t.indexers.pickHint} {t.indexers.showing(Math.min(SHOWN, list.length), list.length)}
      </p>
      {!list.length ? (
        <p className="py-6 text-center text-sm text-muted">{t.indexers.noMatch}</p>
      ) : (
        <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label={t.indexers.addTitle}>
          {list.slice(0, SHOWN).map((s) => (
            <li key={`${s.implementation}-${s.name}`}>
              <button className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2" onClick={() => onPick(s)}>
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted">
                  {[s.protocol, s.privacy && (t.indexers.privacy[s.privacy] ?? s.privacy), s.language, s.description].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Formulario de un indexador (nuevo a partir de su definición, o uno existente). */
function IndexerForm({ initial, isNew, onBack, onClose }: { initial: IndexerFull; isNew: boolean; onBack?: () => void; onClose: () => void }) {
  const run = useRun("prowlarr");
  const profiles = useServiceQuery("prowlarr", ["appprofiles"], prowlarr.getAppProfiles);
  const [ix, setIx] = useState<IndexerFull>(initial);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const fields = ix.fields ?? [];
  const appProfileId = ix.appProfileId ?? profiles.data?.[0]?.id;
  const full = { ...ix, appProfileId };

  async function save() {
    setBusy(true);
    const ok = await run(
      () => (isNew ? prowlarr.createIndexer(full) : prowlarr.updateIndexer(full)),
      isNew ? t.indexers.created(ix.name) : t.indexers.saved(ix.name),
      [["prowlarr"]],
    );
    setBusy(false);
    if (ok) onClose();
  }
  async function test() {
    setTesting(true);
    try {
      await prowlarr.test(full);
      toast.success(t.indexers.testOk(ix.name));
    } catch (e) {
      toast.error(t.indexers.testFailed(ix.name), { description: testFailure(e) ?? errorMessage(e, "prowlarr") });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button className="btn-ghost self-start px-2 py-1 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t.indexers.back}
        </button>
      )}
      {ix.description && <p className="text-sm text-muted">{ix.description}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">{t.indexers.name}</span>
          <input className="input" value={ix.name} onChange={(e) => setIx({ ...ix, name: e.target.value })} />
        </label>
        <div className="flex items-center justify-between gap-4 sm:pt-5">
          <span className="text-sm">{t.indexers.enabled}</span>
          <Toggle label={t.indexers.enabled} checked={ix.enable} onChange={(enable) => setIx({ ...ix, enable })} />
        </div>
        <label>
          <span className="label">{t.indexers.priority}</span>
          <NumberInput
            className="input"
            aria-label={t.indexers.priority}
            min={1}
            max={50}
            value={ix.priority ?? DEFAULT_PRIORITY}
            onValue={(n) => setIx({ ...ix, priority: Math.min(50, Math.max(1, n)) })}
          />
          <span className="mt-1 block text-xs text-muted">{t.indexers.priorityHint}</span>
        </label>
        {!!profiles.data?.length && (
          <label>
            <span className="label">{t.indexers.appProfile}</span>
            <select className="input" value={appProfileId} onChange={(e) => setIx({ ...ix, appProfileId: Number(e.target.value) })}>
              {profiles.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ProviderFields
        idPrefix={`ix-${ix.id ?? "new"}`}
        fields={visibleFields(fields, advanced)}
        onChange={(name, value) => setIx((cur) => ({ ...cur, fields: setFieldValue(cur.fields ?? [], name, value) }))}
      />
      {hasAdvanced(fields) && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          {t.indexers.advanced}
        </label>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button className="btn-outline" disabled={testing} onClick={test}>
          {testing ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" aria-hidden />} {t.indexers.test}
        </button>
        <button className="btn-primary" disabled={busy || !ix.name.trim()} onClick={save}>
          {t.common.save}
        </button>
      </div>
    </div>
  );
}

/** Añadir (con `indexer` null: primero se elige la definición) o editar un indexador de Prowlarr. */
export function IndexerDialog({ indexer, onClose }: { indexer: IndexerFull | null; onClose: () => void }) {
  const [picked, setPicked] = useState<IndexerFull | null>(null);
  const editing = indexer ?? picked;
  const title = indexer ? t.indexers.editTitle(indexer.name) : picked ? t.indexers.newTitle(picked.name) : t.indexers.addTitle;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} wide>
      {editing ? (
        <IndexerForm
          key={editing.name}
          initial={editing}
          isNew={!indexer}
          onBack={indexer ? undefined : () => setPicked(null)}
          onClose={onClose}
        />
      ) : (
        <SchemaPicker onPick={(s) => setPicked({ ...s, enable: true, priority: s.priority ?? DEFAULT_PRIORITY, tags: s.tags ?? [] })} />
      )}
    </Dialog>
  );
}
