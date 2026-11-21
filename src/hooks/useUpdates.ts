import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@/lib/toast";
import { t } from "@/i18n/es";
import { checkUpdate, installUpdate, writeLog, type UpdateInfo } from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";
import { getPrefs } from "@/hooks/usePrefs";
import { isDevBuild } from "@/lib/version";
import { isMobile } from "@/lib/platform";

/** Cada cuánto se vuelve a mirar si hay versión nueva mientras la app sigue abierta. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** En el canal de prueba se mira mucho más a menudo: cada cambio que entra en dev llega en unos minutos. */
export const DEV_CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Canal que se sigue: «Dasharr Dev» (las compilaciones de la rama dev, que se instalan aparte) sigue la versión
 * de prueba; «Dasharr», la última versión publicada.
 */
export function updateChannel(): "stable" | "dev" {
  return isDevBuild() ? "dev" : "stable";
}
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

let lastCheck = 0;

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
  if (isMobile()) {
    // En Android se abre la descarga en el navegador: al terminar, Android pide confirmar la instalación.
    try {
      await installUpdate(u);
      toast(t.updates.mobileDownload(u.version), { id: `update-${u.version}`, duration: 15000 });
    } catch (e) {
      toast.error(t.updates.failed(errorMessage(e)));
    }
    return;
  }
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
    const dev = updateChannel() === "dev";
    lastCheck = Date.now();
    const u = await checkUpdate(dev, __APP_BUILD__);
    set({ checking: false, available: u, upToDate: !u });
    if (u && (manual || !announced.has(u.version))) {
      announced.add(u.version);
      if (!manual && getPrefs().autoUpdate && !isMobile()) scheduleAutoInstall(u);
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

/** Toca volver a mirar: cada 10 minutos en el canal de prueba y cada 6 horas en el estable. */
export function checkDue(now = Date.now()) {
  return now - lastCheck >= (updateChannel() === "dev" ? DEV_CHECK_EVERY_MS : CHECK_EVERY_MS);
}

/** Al abrir la app y luego de vez en cuando, comprueba si hay una versión más nueva (no en desarrollo). */
export function useUpdateCheck() {
  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.VITEST) return;
    const first = setTimeout(() => void runUpdateCheck({ manual: false }), 5000);
    const every = setInterval(() => {
      if (checkDue()) void runUpdateCheck({ manual: false });
    }, DEV_CHECK_EVERY_MS);
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
  lastCheck = 0;
  state = { available: null, checking: false, installing: false, upToDate: false };
}
