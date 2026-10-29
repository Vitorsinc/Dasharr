import { useEffect } from "react";
import { toast } from "sonner";
import { t } from "@/i18n/es";
import { checkUpdate, installUpdate, writeLog, type UpdateInfo } from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";

export async function startUpdate(u: UpdateInfo) {
  const id = toast.loading(t.updates.installing(u.version));
  try {
    await installUpdate(u); // la app se cierra y el instalador la vuelve a abrir
  } catch (e) {
    toast.error(t.updates.failed(errorMessage(e)), { id });
  }
}

export function notifyUpdate(u: UpdateInfo) {
  toast(t.updates.available(u.version), {
    duration: Infinity,
    action: { label: t.updates.install, onClick: () => void startUpdate(u) },
  });
}

/** Al abrir la app, comprueba si hay una versión publicada más nueva (no en modo desarrollo). */
export function useUpdateCheck() {
  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.VITEST) return;
    const timer = setTimeout(() => {
      checkUpdate().then(
        (u) => u && notifyUpdate(u),
        (e) => writeLog("warn", `No se pudo comprobar si hay actualizaciones: ${errorMessage(e)}`),
      );
    }, 5000);
    return () => clearTimeout(timer);
  }, []);
}
