import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { t } from "@/i18n/es";
import { checkUpdate, installUpdate, writeLog, type UpdateInfo } from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";
import { getPrefs } from "@/hooks/usePrefs";
import { isDevBuild } from "@/lib/version";

/** Cada cuánto se vuelve a mirar si hay versión nueva mientras la app sigue abierta. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** Margen antes de instalar sola, para que el usuario pueda posponerlo. */
export const AUTO_INSTALL_DELAY_S = 30;

export interface UpdateState {
  /** Versión nueva encontrada en la última comprobación, si la hay. */
  available: UpdateInfo | null;
  checking: boolean;
  installing: boolean;
  /** La última comprobación terminó sin encontrar nada nuevo. */
  upToDate: boolean;
}

let state: UpdateState = { available: null, checking: false, installing: false, upToDate: false };
const listeners = new Set<() => void>();
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Estado compartido de las actualizaciones (Ajustes, menú lateral…). */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Versiones ya avisadas en esta sesión, para no repetir el aviso en cada comprobación. */
const announced = new Set<string>();
let pendingAuto: { version: string; timer: ReturnType<typeof setTimeout>; toastId: string | number } | null = null;

function cancelAutoInstall() {
  if (!pendingAuto) return;
  clearTimeout(pendingAuto.timer);
  toast.dismiss(pendingAuto.toastId);
  pendingAuto = null;
}

export async function startUpdate(u: UpdateInfo) {
  cancelAutoInstall();
  if (state.installing) return;
  set({ installing: true });
  const id = toast.loading(t.updates.installing(u.version));
  try {
    await installUpdate(u); // la app se cierra y el instalador la vuelve a abrir
  } catch (e) {
    set({ installing: false });
    writeLog("error", `No se pudo instalar la actualización v${u.version}: ${errorMessage(e)}`);
    toast.error(t.updates.failed(errorMessage(e)), { id });
  }
}

export function notifyUpdate(u: UpdateInfo) {
  toast(t.updates.available(u.version), {
    id: `update-${u.version}`,
    duration: Infinity,
    action: { label: t.updates.install, onClick: () => void startUpdate(u) },
  });
}

/** Avisa de que se instalará sola en unos segundos, con opción de hacerlo ya o dejarlo para luego. */
function scheduleAutoInstall(u: UpdateInfo) {
  cancelAutoInstall();
  const toastId = toast(t.updates.autoInstalling(u.version, AUTO_INSTALL_DELAY_S), {
    id: `update-${u.version}`,
    duration: Infinity,
    action: { label: t.updates.installNow, onClick: () => void startUpdate(u) },
    cancel: { label: t.updates.later, onClick: () => cancelAutoInstall() },
    onDismiss: () => cancelAutoInstall(),
  });
  const timer = setTimeout(() => {
    pendingAuto = null;
    void startUpdate(u);
  }, AUTO_INSTALL_DELAY_S * 1000);
  pendingAuto = { version: u.version, timer, toastId };
}

/**
 * Comprueba si hay una versión más nueva. En segundo plano (`manual: false`) solo avisa una vez por versión
 * y, si está activada la instalación automática, la instala sola tras un margen para posponerla.
 */
export async function runUpdateCheck({ manual }: { manual: boolean }): Promise<UpdateInfo | null> {
  if (state.checking || state.installing) return state.available;
  set({ checking: true, upToDate: false });
  try {
    const u = await checkUpdate();
    set({ checking: false, available: u, upToDate: !u });
    if (u && (manual || !announced.has(u.version))) {
      announced.add(u.version);
      // Las compilaciones de prueba (rama dev) no se sustituyen solas por la versión publicada.
      if (!manual && getPrefs().autoUpdate && !isDevBuild()) scheduleAutoInstall(u);
      else if (!manual) notifyUpdate(u);
    }
    return u;
  } catch (e) {
    set({ checking: false });
    if (manual) toast.error(t.updates.checkFailed(errorMessage(e)));
    else writeLog("warn", `No se pudo comprobar si hay actualizaciones: ${errorMessage(e)}`);
    return null;
  }
}

/** Al abrir la app y luego cada pocas horas, comprueba si hay una versión publicada más nueva (no en desarrollo). */
export function useUpdateCheck() {
  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.VITEST) return;
    const first = setTimeout(() => void runUpdateCheck({ manual: false }), 5000);
    const every = setInterval(() => void runUpdateCheck({ manual: false }), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}

/** Solo para pruebas. */
export function resetUpdateState() {
  cancelAutoInstall();
  announced.clear();
  state = { available: null, checking: false, installing: false, upToDate: false };
}
