import type { ProviderField } from "@/api/prowlarr";

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Campos que se enseñan, en su orden: sin los ocultos y, salvo que se pidan, sin los avanzados. */
export function visibleFields(fields: ProviderField[], showAdvanced: boolean): ProviderField[] {
  return fields
    .filter((f) => f.hidden !== "hidden" && !(f.hidden === "hiddenIfNotSet" && isEmpty(f.value)))
    .filter((f) => showAdvanced || !f.advanced)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const hasAdvanced = (fields: ProviderField[]) =>
  fields.some((f) => f.advanced && f.hidden !== "hidden" && !(f.hidden === "hiddenIfNotSet" && isEmpty(f.value)));

export function setFieldValue(fields: ProviderField[], name: string, value: unknown): ProviderField[] {
  return fields.map((f) => (f.name === name ? { ...f, value } : f));
}

/** Etiquetas libres de un campo «tag» escritas separadas por comas. */
export function parseTagList(text: string): string[] {
  return text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Valor de una opción de un desplegable: numérico si las opciones lo son. */
export function optionValue(f: ProviderField, raw: string): number | string {
  const sample = f.selectOptions?.[0]?.value;
  return typeof sample === "number" && raw !== "" ? Number(raw) : raw;
}
