export type ServiceKind = "radarr" | "sonarr" | "prowlarr" | "bazarr" | "qbittorrent" | "tracearr" | "plex";
export const SERVICE_KINDS: ServiceKind[] = ["radarr", "sonarr", "prowlarr", "bazarr", "qbittorrent", "tracearr", "plex"];

export type Route = "local" | "remote" | "offline";

export interface ServiceConfig {
  localUrl?: string | null;
  externalUrl?: string | null;
  enabled: boolean;
}

export interface ServiceSettingsView {
  config: ServiceConfig;
  hasApiKey: boolean;
  username?: string | null;
  hasPassword: boolean;
  proxyUsername?: string | null;
  hasProxyPassword: boolean;
}

/** `undefined` mantiene el valor guardado, `""` lo borra, cualquier otro texto lo sustituye. */
export interface SecretsPatch {
  apiKey?: string;
  username?: string;
  password?: string;
  proxyUsername?: string;
  proxyPassword?: string;
}

export interface FilePart {
  field: string;
  filename: string;
  base64: string;
}

export type ApiErrorKind = "NotConfigured" | "Network" | "Unauthorized" | "Http";
export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message?: string;
}

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "kind" in e && typeof (e as ApiError).kind === "string";
}
