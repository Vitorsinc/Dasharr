import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ApiError, FilePart, Route, SecretsPatch, ServiceConfig, ServiceKind, ServiceSettingsView } from "./types";

export interface ApiCall {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: Record<string, string>;
  files?: FilePart[];
}

type ApiBody =
  | { type: "json"; value: unknown }
  | { type: "form"; value: [string, string][] }
  | { type: "multipart"; value: { fields: [string, string][]; files: FilePart[] } };

function toBody(call: ApiCall): ApiBody | null {
  if (call.files?.length) return { type: "multipart", value: { fields: Object.entries(call.form ?? {}), files: call.files } };
  if (call.form) return { type: "form", value: Object.entries(call.form) };
  if (call.json !== undefined) return { type: "json", value: call.json };
  return null;
}

function toQuery(q: ApiCall["query"]): [string, string][] {
  return Object.entries(q ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]);
}

export async function apiRequest<T>(service: ServiceKind, call: ApiCall): Promise<T> {
  const request = { method: call.method ?? "GET", path: call.path, query: toQuery(call.query), body: toBody(call) };
  return (await invoke<T>("api_request", { service, request })) as T;
}

export const getSettings = () => invoke<Record<ServiceKind, ServiceSettingsView>>("get_settings");

export const saveService = (service: ServiceKind, config: ServiceConfig, secrets: SecretsPatch) =>
  invoke<void>("save_service", { service, config, secrets });

export const testService = (service: ServiceKind, config: ServiceConfig, secrets: SecretsPatch) =>
  invoke<string>("test_service", { service, config, secrets });

export type RouteMap = Record<ServiceKind, Route | null>;
export const getConnectionStates = () => invoke<RouteMap>("get_connection_states");
export const refreshConnections = () => invoke<RouteMap>("refresh_connections");

export function onConnectionChanged(cb: (routes: RouteMap) => void): Promise<UnlistenFn> {
  return listen<RouteMap>("connection-changed", (e) => cb(e.payload));
}

/** URL para cargar una imagen autenticada a través del protocolo propio. */
export function imageUrl(service: ServiceKind, path: string): string {
  return convertFileSrc(`${service}${path.startsWith("/") ? path : `/${path}`}`, "dasharr-img");
}

export type { ApiError };
