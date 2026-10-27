import { t } from "@/i18n/es";
import { isApiError } from "./types";

export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    switch (e.kind) {
      case "NotConfigured":
        return t.errors.NotConfigured;
      case "Network":
        return e.message ? `${t.errors.Network} (${e.message})` : t.errors.Network;
      case "Unauthorized":
        return t.errors.Unauthorized;
      case "Http":
        return `${t.errors.Http} ${e.status}${e.message ? `: ${e.message}` : ""}`;
    }
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return t.errors.unknown;
}
