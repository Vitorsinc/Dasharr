import { useEffect, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { buildPlexIndex, isOwner, newSessions, plex, plexTitle, type PlexSession } from "@/api/plex";
import { t } from "@/i18n/es";
import { usePrefs } from "./usePrefs";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export const PLEX_SESSIONS_REFRESH = 10_000;

export const usePlexSessions = (opts: { enabled?: boolean } = {}) =>
  useServiceQuery("plex", ["sessions"], plex.sessions, { refetchInterval: PLEX_SESSIONS_REFRESH, ...opts });

export const usePlexRecent = () => useServiceQuery("plex", ["recent"], () => plex.recentlyAdded(), { refetchInterval: REFRESH.library });

export const usePlexServer = () => useServiceQuery("plex", ["server"], plex.server, { staleTime: REFRESH.library });

/** Índice de la biblioteca de Plex por TMDB/TVDB/IMDb. Es una consulta grande: se reutiliza durante unos minutos. */
export const usePlexIndex = () => useServiceQuery("plex", ["index"], buildPlexIndex, { staleTime: REFRESH.library });

export function sessionLine(s: PlexSession): string {
  const { title, subtitle } = plexTitle(s);
  const what = s.type === "episode" && subtitle ? `${title} (${subtitle.split(" · ")[0]})` : title;
  return t.plex.watching(s.User?.title ?? "?", what, s.Player?.title ?? s.Player?.product ?? "?");
}

async function notify(body: string) {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title: t.plex.startedTitle, body });
}

/** Avisa con una notificación de Windows cuando otro usuario empieza a ver algo en Plex. */
export function usePlexNotifications() {
  const [{ plexNotifications }] = usePrefs();
  const { data } = usePlexSessions({ enabled: plexNotifications });
  const prev = useRef<PlexSession[] | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (plexNotifications) newSessions(prev.current, data).filter((s) => !isOwner(s)).forEach((s) => void notify(sessionLine(s)).catch(() => {}));
    prev.current = data;
  }, [data, plexNotifications]);
}
