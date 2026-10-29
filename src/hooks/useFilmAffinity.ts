import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { faKey, faRating, faRatings, onFaRating, type FaItem, type FaRating } from "@/api/filmaffinity";

/** Notas de una lista: las guardadas al momento y el resto según van llegando. */
export function useFaRatings(items: FaItem[] | undefined): Record<string, FaRating> {
  const [ratings, setRatings] = useState<Record<string, FaRating>>({});
  // Solo se vuelve a pedir si cambia qué hay en la lista, no en cada refresco de Radarr/Sonarr.
  const signature = useMemo(() => (items ?? []).map(faKey).join(","), [items]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    onFaRating((key, rating) => {
      if (!rating) return;
      setRatings((r) => ({ ...r, [key]: rating }));
    })
      .then((u) => (alive ? (unlisten = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!items?.length) return;
    faRatings(items)
      .then((found) => found && setRatings((r) => ({ ...r, ...found })))
      .catch(() => {});
  }, [signature]);

  return ratings;
}

/** Nota de la ficha abierta. */
export function useFaRating(item: FaItem | null) {
  return useQuery({
    queryKey: ["filmaffinity", item ? faKey(item) : null],
    queryFn: async () => (await faRating(item!)) ?? null,
    enabled: item != null,
    staleTime: Infinity,
    retry: false,
  });
}
