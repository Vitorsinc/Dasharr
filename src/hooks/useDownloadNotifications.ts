import { useEffect, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { qbit, detectCompleted, type Torrent } from "@/api/qbit";
import { t } from "@/i18n/es";
import { usePrefs } from "./usePrefs";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

async function notify(body: string) {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title: t.downloads.finished, body });
}

/** Vigila qBittorrent en segundo plano y avisa cuando un torrent termina. */
export function useDownloadNotifications() {
  const [{ notifications }] = usePrefs();
  const { data } = useServiceQuery("qbittorrent", ["torrents"], qbit.getTorrents, { refetchInterval: REFRESH.torrents, enabled: notifications });
  const prev = useRef<Torrent[] | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (notifications) detectCompleted(prev.current, data).forEach((tr) => void notify(tr.name).catch(() => {}));
    prev.current = data;
  }, [data, notifications]);
}
