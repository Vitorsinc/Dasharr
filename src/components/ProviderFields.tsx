import { useEffect, useState } from "react";
import type { ProviderField } from "@/api/prowlarr";
import { optionValue, parseTagList } from "@/lib/providerFields";

/** Número con texto propio para dejar escribir decimales o borrar el campo sin que salte a 0. */
function NumberField({ field, onChange, id }: { field: ProviderField; onChange: (v: number | null) => void; id: string }) {
  const value = typeof field.value === "number" ? field.value : null;
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((cur) => (cur !== "" && Number(cur) === value ? cur : value == null ? "" : String(value)));
  }, [value]);
  return (
    <input
      id={id}
      className="input"
      type="number"
      step={field.isFloat ? "any" : 1}
      value={text}
      placeholder={field.placeholder}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === "") onChange(null);
        else if (Number.isFinite(Number(e.target.value))) onChange(field.isFloat ? Number(e.target.value) : Math.round(Number(e.target.value)));
      }}
    />
  );
}

function Input({ field, onChange, id }: { field: ProviderField; onChange: (v: unknown) => void; id: string }) {
  const str = field.value == null ? "" : String(field.value);
  switch (field.type) {
    case "checkbox":
      return <input id={id} type="checkbox" className="h-4 w-4" checked={!!field.value} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return <NumberField id={id} field={field} onChange={onChange} />;
    case "password":
      return <input id={id} className="input" type="password" autoComplete="off" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "textArea":
      return <textarea id={id} className="input h-24" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "select": {
      const options = [...(field.selectOptions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (Array.isArray(field.value)) {
        const values = field.value as (number | string)[];
        return (
          <div id={id} role="group" aria-label={field.label ?? field.name} className="flex flex-wrap gap-x-4 gap-y-1">
            {options.map((o) => (
              <label key={String(o.value)} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={values.includes(o.value)}
                  onChange={(e) => onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
                />
                {o.name}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select id={id} className="input" value={str} onChange={(e) => onChange(optionValue(field, e.target.value))}>
          {field.value == null && (
            <option value="" disabled>
              —
            </option>
          )}
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.name}
            </option>
          ))}
        </select>
      );
    }
    case "tag":
      return (
        <input
          id={id}
          className="input"
          value={Array.isArray(field.value) ? (field.value as unknown[]).join(", ") : str}
          onChange={(e) => onChange(parseTagList(e.target.value))}
        />
      );
    default:
      return (
        <input
          id={id}
          className="input"
          value={str}
          placeholder={field.placeholder}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Formulario generado a partir de los campos que describe Prowlarr (se usa para crear y editar indexadores). */
export function ProviderFields({ fields, onChange, idPrefix }: { fields: ProviderField[]; onChange: (name: string, value: unknown) => void; idPrefix: string }) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.name}`;
        const label = f.label ?? f.name;
        if (f.type === "info")
          return (
            <p key={f.name} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {f.helpText ?? (f.value != null ? String(f.value) : label)}
            </p>
          );
        const inline = f.type === "checkbox";
        return (
          <div key={f.name} className={inline ? "flex items-start gap-3" : undefined}>
            {inline && <Input id={id} field={f} onChange={(v) => onChange(f.name, v)} />}
            <div className={inline ? "flex flex-col" : undefined}>
              <label htmlFor={id} className={inline ? "text-sm" : "label"}>
                {label}
                {f.unit ? ` (${f.unit})` : ""}
              </label>
              {!inline && <Input id={id} field={f} onChange={(v) => onChange(f.name, v)} />}
              {f.helpText && <span className="mt-1 block text-xs text-muted">{f.helpText}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
