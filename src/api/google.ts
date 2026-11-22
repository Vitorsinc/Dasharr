import { invoke } from "@tauri-apps/api/core";

export interface GoogleStatus {
  /** Esta versión trae la conexión con Google. */
  available: boolean;
  signedIn: boolean;
  email: string | null;
  /** Este dispositivo ya ha traído o subido la copia alguna vez. */
  linked: boolean;
  lastSync: number | null;
}

export type PushResult =
  | { status: "unchanged" }
  | { status: "uploaded" }
  | { status: "remoteNewer"; updatedAt: number | null; device: string | null };

export type PullResult =
  | { status: "empty" }
  | { status: "unchanged" }
  | { status: "applied"; prefs: unknown; updatedAt: number; device: string };

export const googleStatus = () => invoke<GoogleStatus>("google_status");
/** Abre el navegador y espera a que el usuario acepte. Devuelve el correo. */
export const googleLogin = () => invoke<string>("google_login");
/** Termina el inicio de sesión con la dirección que muestra el navegador (si Dasharr no pudo recogerla solo). */
export const googleLoginPaste = (url: string) => invoke<void>("google_login_paste", { url });
export const googleLoginCancel = () => invoke<void>("google_login_cancel");
export const googleLogout = () => invoke<void>("google_logout");
export const syncPush = (prefs: unknown, force = false) => invoke<PushResult>("sync_push", { prefs, force });
export const syncPull = (force = false) => invoke<PullResult>("sync_pull", { force });
export const syncDeleteRemote = () => invoke<void>("sync_delete_remote");
