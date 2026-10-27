import { qbit } from "@/api/qbit";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

export const useTorrents = () => useServiceQuery("qbittorrent", ["torrents"], qbit.getTorrents, { refetchInterval: REFRESH.torrents });
export const useServerState = () => useServiceQuery("qbittorrent", ["server-state"], qbit.getServerState, { refetchInterval: REFRESH.torrents });
export const useCategories = () => useServiceQuery("qbittorrent", ["categories"], qbit.getCategories, { staleTime: REFRESH.library });
