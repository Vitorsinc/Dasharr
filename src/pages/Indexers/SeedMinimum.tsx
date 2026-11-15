import { useState } from "react";
import type { ProviderField } from "@/api/prowlarr";
import { SEED_FIELDS } from "@/api/seedRules";
import { t } from "@/i18n/es";

const SEED_NAMES = new Set<string>(Object.values(SEED_FIELDS));
/** Los campos de siembra van en su propio bloque, no en la lista general. */
export const isSeedField = (f: ProviderField) => SEED_NAMES.has(f.name);
export const hasSeedFields = (fields: ProviderField[]) => fields.some(isSeedField);

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false });

/** Campo numérico que puede quedarse vacío (= sin mínimo). Acepta coma decimal. */
function OptionalNumber({
  label,
  value,
  onValue,
  unit,
}: {
  label: string;
  value: number | null;
  onValue: (v: number | null) => void;
  unit: string;
}) {
  const [text, setText] = useState(value == null ? "" : nf.format(value).replace(".", ","));
  return (
    <label>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="input"
          inputMode="decimal"
          aria-label={label}
          value={text}
          placeholder="—"
          onChange={(e) => {
            setText(e.target.value);
            const raw = e.target.value.trim().replace(",", ".");
            const n = Number(raw);
            if (raw === "") onValue(null);
            else if (Number.isFinite(n) && n >= 0) onValue(n);
          }}
        />
        <span className="shrink-0 text-sm text-muted">{unit}</span>
      </div>
    </label>
  );
}

const fieldNumber = (fields: ProviderField[], name: string) => {
  const v = fields.find((f) => f.name === name)?.value;
  return v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
};

/**
 * Seed mínimo del tracker, guardado en el indexador de Prowlarr (que lo pasa a Radarr y Sonarr, y
 * estos a qBittorrent). Prowlarr lo guarda en minutos; aquí se edita en horas.
 */
export function SeedMinimum({ fields, onChange }: { fields: ProviderField[]; onChange: (name: string, value: number | null) => void }) {
  const has = (name: string) => fields.some((f) => f.name === name);
  const minutes = fieldNumber(fields, SEED_FIELDS.time);
  const pack = fieldNumber(fields, SEED_FIELDS.packTime);
  const toHours = (m: number | null) => (m == null ? null : Math.round((m / 60) * 100) / 100);
  const toMinutes = (h: number | null) => (h == null ? null : Math.round(h * 60));
  return (
    <fieldset className="rounded-lg border border-border px-4 pb-4 pt-2">
      <legend className="px-1 text-sm font-semibold">{t.indexers.seed.title}</legend>
      <p className="mb-3 text-xs text-muted">{t.indexers.seed.hint}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {has(SEED_FIELDS.time) && (
          <OptionalNumber
            label={t.indexers.seed.hours}
            unit={t.indexers.seed.hoursUnit}
            value={toHours(minutes)}
            onValue={(d) => onChange(SEED_FIELDS.time, toMinutes(d))}
          />
        )}
        {has(SEED_FIELDS.ratio) && (
          <OptionalNumber
            label={t.indexers.seed.ratio}
            unit=""
            value={fieldNumber(fields, SEED_FIELDS.ratio)}
            onValue={(r) => onChange(SEED_FIELDS.ratio, r)}
          />
        )}
        {has(SEED_FIELDS.packTime) && (
          <OptionalNumber
            label={t.indexers.seed.packHours}
            unit={t.indexers.seed.hoursUnit}
            value={toHours(pack)}
            onValue={(d) => onChange(SEED_FIELDS.packTime, toMinutes(d))}
          />
        )}
      </div>
    </fieldset>
  );
}
