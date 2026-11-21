import type { ProviderField } from "@/api/prowlarr";
import type { BazarrSettings, ProviderStatus } from "@/api/bazarr";
import { BAZARR_PROVIDERS, fieldLabel, type CatalogField, type CatalogFieldType } from "@/api/bazarrCatalog";

export type ProviderState = "ok" | "throttled" | "missing" | "off";

export interface ProviderRow {
  key: string;
  name: string;
  description?: string;
  note?: string;
  anidb?: boolean;
  enabled: boolean;
  state: ProviderState;
  status?: ProviderStatus;
  fields: CatalogField[];
}

export function enabledProviders(settings: BazarrSettings | undefined): string[] {
  const v = settings?.general?.enabled_providers;
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

/** Campos de un proveedor que no está en la lista (Bazarr más nuevo), deducidos de sus ajustes. */
export function inferFields(section: Record<string, unknown> | undefined): CatalogField[] {
  return Object.entries(section ?? {}).map(([key, v]): CatalogField => {
    const type: CatalogFieldType =
      typeof v === "boolean" ? "switch" : typeof v === "number" ? "number" : Array.isArray(v) ? "list" : /pass|key|token/i.test(key) ? "password" : "text";
    return { key, type };
  });
}

function stateOf(enabled: boolean, status: ProviderStatus | undefined): ProviderState {
  if (!enabled) return "off";
  if (!status) return "missing";
  return status.status && status.status !== "Good" ? "throttled" : "ok";
}

/** Todos los proveedores (los de la lista y los activos que no estén en ella), activos primero. */
export function providerRows(settings: BazarrSettings | undefined, statuses: ProviderStatus[] | undefined): ProviderRow[] {
  const enabled = enabledProviders(settings);
  const byName = new Map((statuses ?? []).map((s) => [s.name, s]));
  const known = new Set(BAZARR_PROVIDERS.map((p) => p.key));
  const rows: ProviderRow[] = [
    ...BAZARR_PROVIDERS.map((p) => ({ ...p, fields: p.fields ?? [] })),
    ...enabled.filter((k) => !known.has(k)).map((k) => ({ key: k, name: k, fields: inferFields(settings?.[k]) })),
  ].map((p) => {
    const on = enabled.includes(p.key);
    const status = byName.get(p.key);
    return { ...p, enabled: on, status, state: stateOf(on, status) };
  });
  return rows.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, "es"));
}

/** Valores iniciales del formulario: lo guardado en Bazarr o, si no hay nada, el valor por defecto. */
export function initialValues(fields: CatalogField[], section: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => {
      const saved = section?.[f.key];
      const v = saved ?? f.default ?? (f.type === "switch" ? false : f.type === "list" ? [] : "");
      return [f.key, v];
    }),
  );
}

const FIELD_TYPE: Record<CatalogFieldType, string> = {
  text: "textbox",
  password: "password",
  switch: "checkbox",
  number: "number",
  select: "select",
  list: "tag",
};

/** Los campos con la forma que pinta el formulario común (el de Prowlarr). */
export function toFormFields(fields: CatalogField[], values: Record<string, unknown>): ProviderField[] {
  return fields.map((f) => ({
    name: f.key,
    label: fieldLabel(f),
    helpText: f.help,
    type: FIELD_TYPE[f.type],
    value: values[f.key],
    selectOptions: f.options?.map((o, order) => ({ value: o.value, name: o.label, order })),
  }));
}

export function validateValues(fields: CatalogField[], values: Record<string, unknown>): string | null {
  for (const f of fields) {
    const why = f.validate?.(String(values[f.key] ?? ""));
    if (why) return why;
  }
  return null;
}

const REASONS: Record<string, string> = {
  TooManyRequests: "demasiadas peticiones",
  DownloadLimitExceeded: "límite de descargas alcanzado",
  SearchLimitReached: "límite de búsquedas alcanzado",
  APIThrottled: "la API le ha puesto un límite",
  AuthenticationError: "usuario o contraseña incorrectos",
  ConfigurationError: "falta configurarlo",
  PaymentRequired: "hace falta una cuenta de pago",
  ServiceUnavailable: "la web no está disponible",
  ConnectionError: "no se puede conectar",
  ConnectTimeout: "no responde",
  ReadTimeout: "tarda demasiado en responder",
  Timeout: "tarda demasiado en responder",
  ProxyError: "error del proxy",
  IPAddressBlocked: "ha bloqueado tu IP",
  ParseResponseError: "respuesta que Bazarr no entiende",
  ProviderError: "error del proveedor",
  PermissionError: "sin permiso",
};

export function throttleReason(status: string): string {
  const name = status.split(".").pop() ?? status;
  return REASONS[name] ?? status;
}

const UNITS: Record<string, [string, string]> = {
  second: ["segundo", "segundos"],
  minute: ["minuto", "minutos"],
  hour: ["hora", "horas"],
  day: ["día", "días"],
  week: ["semana", "semanas"],
  month: ["mes", "meses"],
  year: ["año", "años"],
};

/** "in 2 hours" → "en 2 horas"; lo que no se reconoce se deja tal cual. */
export function retryText(retry: string): string | null {
  const r = retry.trim();
  if (!r || r === "-") return null;
  if (r === "tomorrow") return "mañana";
  if (r === "just now" || r === "now") return "ya";
  const m = /^in (a|an|\d+) (second|minute|hour|day|week|month|year)s?$/i.exec(r);
  if (!m) return r;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const [one, many] = UNITS[m[2].toLowerCase()];
  return `en ${n === 1 ? (one === "hora" || one === "semana" ? "una" : "un") : n} ${n === 1 ? one : many}`;
}
