import { useQuery } from "@tanstack/react-query";
import { qbit, type Torrent } from "@/api/qbit";
import { arrDownloadHistory, findDuplicates, type Duplicates } from "@/api/duplicates";
import { useIsConfigured } from "./useSettings";

export interface DuplicatesData extends Duplicates {
  /** Todos los torrents de qBittorrent, para saber cuáles comparten archivos. */
  torrents: Torrent[];
  /** *arr cuyo historial no se pudo leer. */
  failed: ("radarr" | "sonarr")[];
  /** `false` si no se pudo saber qué torrents no son de ningún *arr (falló o no cupo algún historial). */
  orphansKnown: boolean;
}

/** qBittorrent solo dice el tracker si alguno responde: a los parados se les pregunta la lista. */
async function fillTrackers(torrents: Torrent[]) {
  const missing = torrents.filter((t) => !t.tracker);
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(
      missing.slice(i, i + 5).map(async (t) => {
        try {
          t.tracker = (await qbit.getTrackers(t.hash)).find((x) => /^(https?|udp):/i.test(x.url))?.url;
        } catch {
          /* se queda sin tracker */
        }
      }),
    );
  }
}

/**
 * Torrents de qBittorrent cruzados con el historial de Radarr y Sonarr. Si un *arr falla se enseña
 * lo del otro. Comparte caché entre la página «Duplicados» y el aviso de Inicio.
 */
export function useDuplicates(opts: { staleTime?: number } = {}) {
  const qbitOn = useIsConfigured("qbittorrent");
  const radarrOn = useIsConfigured("radarr");
  const sonarrOn = useIsConfigured("sonarr");
  const q = useQuery({
    queryKey: ["qbittorrent", "duplicates", radarrOn, sonarrOn],
    enabled: qbitOn === true && (radarrOn === true || sonarrOn === true),
    staleTime: opts.staleTime ?? 60_000,
    queryFn: async (): Promise<DuplicatesData> => {
      const torrents = await qbit.getTorrents();
      const services = (["radarr", "sonarr"] as const).filter((s) => (s === "radarr" ? radarrOn : sonarrOn));
      const results = await Promise.allSettled(services.map((s) => arrDownloadHistory(s, torrents)));
      const history = services.flatMap((service, i) => {
        const r = results[i];
        return r.status === "fulfilled" ? [{ service, records: r.value.records }] : [];
      });
      const failed = services.filter((_, i) => results[i].status === "rejected");
      const orphansKnown = results.every((r) => r.status === "fulfilled" && r.value.complete);
      const found = findDuplicates(torrents, history, { orphans: orphansKnown });
      await fillTrackers(
        [...found.groups.flatMap((g) => g.items), ...found.orphans].filter((i) => i.role !== "current").map((i) => i.torrent),
      );
      return { ...found, torrents, failed, orphansKnown };
    },
  });
  return { ...q, qbitOn, arrOn: radarrOn === true || sonarrOn === true, arrKnown: radarrOn !== undefined && sonarrOn !== undefined };
}
