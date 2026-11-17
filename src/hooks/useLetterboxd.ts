import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { lbRating, lbRatings, onLbRating, type LbRating } from "@/api/letterboxd";

/** Notas de una lista de películas (por id de TMDb): las guardadas al momento y el resto según van llegando. */
export function useLbRatings(tmdbIds: number[] | undefined): Record<string, LbRating> {
  const [ratings, setRatings] = useState<Record<string, LbRating>>({});
  // Solo se vuelve a pedir si cambia qué hay en la lista, no en cada refresco de Radarr.
  const signature = useMemo(() => (tmdbIds ?? []).join(","), [tmdbIds]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    onLbRating((id, rating) => {
      if (!rating) return;
      setRatings((r) => ({ ...r, [id]: rating }));
    })
      .then((u) => (alive ? (unlisten = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!tmdbIds?.length) return;
    lbRatings(tmdbIds)
      .then((found) => found && setRatings((r) => ({ ...r, ...found })))
      .catch(() => {});
  }, [signature]);

  return ratings;
}

/** Nota de la ficha abierta. */
export function useLbRating(tmdbId: number | null) {
  return useQuery({
    queryKey: ["letterboxd", tmdbId],
    queryFn: async () => (await lbRating(tmdbId!)) ?? null,
    enabled: tmdbId != null,
    staleTime: Infinity,
    retry: false,
  });
}
