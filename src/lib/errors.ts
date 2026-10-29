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
