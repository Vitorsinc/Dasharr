import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConnectionStates, onConnectionChanged, type RouteMap } from "@/lib/tauri";

export const connectionKey = ["connection-states"] as const;

export function useConnectionStates() {
  const qc = useQueryClient();
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onConnectionChanged((routes) => qc.setQueryData<RouteMap>(connectionKey, routes)).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [qc]);
  return useQuery({ queryKey: connectionKey, queryFn: getConnectionStates, refetchInterval: 60_000 });
}
