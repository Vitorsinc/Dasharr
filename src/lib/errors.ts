import { t } from "@/i18n/es";
import { isApiError, type ServiceKind } from "./types";

/** Mensaje en español; con el servicio, añade dónde se consigue la clave correcta si falla la autenticación. */
export function errorMessage(e: unknown, service?: ServiceKind): string {
  if (isApiError(e)) {
    switch (e.kind) {
      case "NotConfigured":
        return t.errors.NotConfigured;
      case "Network":
        return e.message ? `${t.errors.Network} (${e.message})` : t.errors.Network;
      case "Unauthorized":
        return service ? `${t.errors.Unauthorized} ${t.errors.unauthorizedHint[service]}` : t.errors.Unauthorized;
      case "Http":
        return `${t.errors.Http} ${e.status}${e.message ? `: ${e.message}` : ""}`;
    }
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return t.errors.unknown;
}

/**
 * Motivo de un 400 de validación de Radarr/Sonarr/Prowlarr (`[{ "errorMessage": "…" }]`). El cuerpo puede
 * llegar recortado, así que se buscan los mensajes con una expresión.
 */
export function validationMessage(e: unknown): string | undefined {
  if (!isApiError(e) || e.kind !== "Http" || !e.message) return undefined;
  const found = [...e.message.matchAll(/"errorMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
  return found.length ? [...new Set(found)].join(" · ") : undefined;
}

/** Mensaje para un error al guardar en un *arr: el motivo de validación si lo hay, o el genérico. */
export function arrErrorMessage(e: unknown, service?: ServiceKind): string {
  return validationMessage(e) ?? errorMessage(e, service);
}
