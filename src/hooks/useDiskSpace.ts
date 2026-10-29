import { useMemo } from "react";
import { getDiskSpace, mergeDisks } from "@/api/diskspace";
import { qbit } from "@/api/qbit";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

/** Discos del servidor según Radarr, Sonarr y qBittorrent, ya agrupados. */
export function useDiskSpace() {
  const radarr = useServiceQuery("radarr", ["diskspace"], () => getDiskSpace("radarr"), { refetchInterval: REFRESH.status });
  const sonarr = useServiceQuery("sonarr", ["diskspace"], () => getDiskSpace("sonarr"), { refetchInterval: REFRESH.status });
  const qb = useServiceQuery("qbittorrent", ["free-space"], qbit.getServerState, { refetchInterval: REFRESH.queue });
  const queries = [radarr, sonarr, qb];
  const disks = useMemo(
    () =>
      mergeDisks(
        [
          { service: "radarr", disks: radarr.data },
          { service: "sonarr", disks: sonarr.data },
        ],
        qb.data?.free_space_on_disk,
      ),
    [radarr.data, sonarr.data, qb.data],
  );
  return {
    disks,
    noneConfigured: queries.every((q) => q.configured === false),
    isLoading: queries.some((q) => q.isLoading),
  };
}
