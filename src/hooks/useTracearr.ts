import { tracearr } from "@/api/tracearr";
import { REFRESH, useServiceQuery } from "./useServiceQuery";

/** Quién ha visto una película o serie. Se desactiva si Tracearr no está configurado o no hay IDs. */
export function useMediaHistory(refs: string[]) {
  return useServiceQuery("tracearr", ["media", ...refs], () => tracearr.mediaHistory(refs), {
    enabled: refs.length > 0,
    staleTime: 60_000,
  });
}

export function useTracearrUsers() {
  return useServiceQuery("tracearr", ["users"], tracearr.users, { staleTime: REFRESH.library });
}

export function useStreams() {
  return useServiceQuery("tracearr", ["streams"], tracearr.streams, { refetchInterval: 15_000 });
}
