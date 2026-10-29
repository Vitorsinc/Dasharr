import { NowPlaying } from "@/components/plex/NowPlaying";
import { useIsConfigured } from "@/hooks/useSettings";
import { TracearrNowPlaying } from "@/pages/History";

/**
 * "Reproduciendo ahora" una sola vez aunque estén Plex y Tracearr: manda Plex (en tiempo real y con botón
 * de detener) y, si no está configurado, se usa lo que sabe Tracearr.
 */
export function NowWatching({ title, hideWhenEmpty }: { title?: string; hideWhenEmpty?: boolean }) {
  const plex = useIsConfigured("plex");
  if (plex === undefined) return null;
  return plex ? <NowPlaying title={title} hideWhenEmpty={hideWhenEmpty} /> : <TracearrNowPlaying />;
}
