import { useQuery, type Query, type UseQueryResult } from "@tanstack/react-query";
import type { ServiceKind } from "@/lib/types";
import { useIsConfigured } from "./useSettings";

export const REFRESH = {
  torrents: 2_000,
  queue: 10_000,
  status: 60_000,
  library: 5 * 60_000,
} as const;

/** Consulta de un servicio: se desactiva si no está configurado. La clave empieza siempre por el servicio. */
export function useServiceQuery<T>(
  service: ServiceKind,
  key: unknown[],
  fn: () => Promise<T>,
  opts: { refetchInterval?: number | ((q: Query<T, Error, T, unknown[]>) => number); enabled?: boolean; staleTime?: number } = {},
): UseQueryResult<T> & { configured: boolean | undefined } {
  const configured = useIsConfigured(service);
  const q = useQuery({
    queryKey: [service, ...key],
    queryFn: fn,
    enabled: configured === true && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
    staleTime: opts.staleTime,
  });
  return Object.assign(q, { configured });
}
