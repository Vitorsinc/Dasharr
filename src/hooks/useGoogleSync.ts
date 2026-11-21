import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { googleStatus, syncPull, syncPush, type GoogleStatus, type PullResult } from "@/api/google";
import { getPrefs, setPrefs, subscribePrefs, type Prefs } from "@/hooks/usePrefs";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { t } from "@/i18n/es";

export const googleStatusKey = ["google-status"] as const;

/** Preferencias que son de cada dispositivo (dependen de la pantalla) y no viajan. */
const DEVICE_PREFS: (keyof Prefs)[] = ["sidebarCollapsed", "downloadColumns"];

export function syncedPrefs(prefs: Prefs = getPrefs()): Partial<Prefs> {
  const out: Partial<Prefs> = { ...prefs };
  for (const k of DEVICE_PREFS) delete out[k];
  return out;
}

/** Aplica las preferencias que vienen de la copia, sin tocar las de este dispositivo. */
export function applySyncedPrefs(remote: unknown) {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return;
  const patch: Record<string, unknown> = { ...(remote as Record<string, unknown>) };
  for (const k of DEVICE_PREFS) delete patch[k];
  setPrefs(patch as Partial<Prefs>);
}

/** Último error de la sincronización automática, para mostrarlo en Ajustes. */
let lastError: string | null = null;
const errorListeners = new Set<() => void>();
function setLastError(e: string | null) {
  if (e === lastError) return;
  lastError = e;
  errorListeners.forEach((l) => l());
}
export function useSyncError() {
  return useSyncExternalStore(
    (l) => {
      errorListeners.add(l);
      return () => errorListeners.delete(l);
    },
    () => lastError,
  );
}

export function useGoogleStatus() {
  return useQuery<GoogleStatus | null>({ queryKey: googleStatusKey, queryFn: async () => (await googleStatus()) ?? null, staleTime: 60_000 });
}

/** Tras traer la copia: aplica las preferencias y vuelve a leer todo lo que depende de los servicios. */
export async function afterPull(qc: QueryClient, res: PullResult, quiet = false) {
  if (res.status !== "applied") return;
  applySyncedPrefs(res.prefs);
  await qc.invalidateQueries();
  if (!quiet) toast.success(t.google.pulled(res.device, formatDateTime(new Date(res.updatedAt))));
}

const PULL_EVERY = 5 * 60_000;
/** Subir cuesta nada si no ha cambiado nada (se compara una huella sin conectarse). */
const PUSH_EVERY = 30_000;
const PUSH_DELAY = 3_000;

let running = false;
async function cycle(qc: QueryClient, pull: boolean) {
  if (running) return;
  running = true;
  try {
    if (pull) await afterPull(qc, await syncPull());
    const pushed = await syncPush(syncedPrefs());
    // Otro dispositivo ha guardado entretanto: gana el último, así que se trae su copia.
    if (pushed.status === "remoteNewer") await afterPull(qc, await syncPull());
    if (pushed.status === "uploaded" || pull) qc.invalidateQueries({ queryKey: googleStatusKey });
    setLastError(null);
  } catch (e) {
    setLastError(errorMessage(e));
  } finally {
    running = false;
  }
}

/** Sincronización automática con Google mientras la app está abierta (si este dispositivo está vinculado). */
export function useGoogleSync() {
  const qc = useQueryClient();
  const { data } = useGoogleStatus();
  const ready = !!(data?.available && data.signedIn && data.hasPassword && data.linked);
  useEffect(() => {
    if (!ready) return;
    let pushTimer: ReturnType<typeof setTimeout> | undefined;
    void cycle(qc, true);
    const pullTimer = setInterval(() => void cycle(qc, true), PULL_EVERY);
    const pushInterval = setInterval(() => void cycle(qc, false), PUSH_EVERY);
    const unsubscribe = subscribePrefs(() => {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void cycle(qc, false), PUSH_DELAY);
    });
    // Al volver a la app se trae lo último; al dejarla (en el móvil puede cerrarse) se sube lo pendiente.
    const onVisibility = () => void cycle(qc, document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(pullTimer);
      clearInterval(pushInterval);
      clearTimeout(pushTimer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, qc]);
}
