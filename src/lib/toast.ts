import type { ReactNode } from "react";
import { toast as sonner } from "sonner";
import { reportError } from "./errorLog";

type Sonner = typeof sonner;

function text(node: ReactNode | (() => ReactNode)): string {
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

/**
 * El `toast` de sonner, pero los avisos de error se apuntan también en la campanita para poder verlos después
 * de que el aviso desaparezca. Úsalo en lugar de importar `toast` de «sonner».
 */
const error: Sonner["error"] = (message, data) => {
  const description = text(data?.description as ReactNode);
  reportError([text(message), description].filter(Boolean).join(" · "));
  return sonner.error(message, data);
};

export const toast: Sonner = Object.assign((...args: Parameters<Sonner>) => sonner(...args), sonner, { error });
