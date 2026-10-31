import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ArrService } from "@/api/arr";
import { arrManage } from "@/api/arrManage";
import type { ServiceKind } from "@/lib/types";
import { arrErrorMessage } from "@/lib/errors";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

/** Se usa en la biblioteca: si la respuesta no es una lista (versión rara, proxy), sin etiquetas. */
export const useTags = (service: ArrService) =>
  useServiceQuery(service, ["tags"], async () => {
    const list = await arrManage(service).getTags();
    return Array.isArray(list) ? list : [];
  }, { staleTime: REFRESH.library });
export const useTagDetails = (service: ArrService) => useServiceQuery(service, ["tags", "detail"], arrManage(service).getTagDetails);
/** Misma clave que los perfiles de `useRadarrMeta`/`useSonarrMeta`: al guardar uno se actualizan los dos. */
export const useQualityProfiles = (service: ArrService) =>
  useServiceQuery(service, ["profiles"], arrManage(service).getQualityProfiles, { staleTime: REFRESH.library });
export const useCustomFormats = (service: ArrService) => useServiceQuery(service, ["customformats"], arrManage(service).getCustomFormats);
export const useRootFolders = (service: ArrService) =>
  useServiceQuery(service, ["roots"], arrManage(service).getRootFolders, { staleTime: REFRESH.library });
export const useDelayProfiles = (service: ArrService) => useServiceQuery(service, ["delayprofiles"], arrManage(service).getDelayProfiles);

/**
 * Ejecuta un cambio en un servicio: avisa del resultado (con el motivo de validación si lo rechaza) y
 * refresca las consultas indicadas (por defecto, todas las del servicio). Devuelve si ha ido bien.
 */
export function useRun(service: ServiceKind) {
  const qc = useQueryClient();
  return useCallback(
    async (fn: () => Promise<unknown>, ok?: string, invalidate: unknown[][] = [[service]]) => {
      try {
        await fn();
        if (ok) toast.success(ok);
        await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
        return true;
      } catch (e) {
        toast.error(arrErrorMessage(e, service));
        return false;
      }
    },
    [qc, service],
  );
}
