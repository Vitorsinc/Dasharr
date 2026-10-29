import { useQuery } from "@tanstack/react-query";
import { plexUsers } from "@/lib/tauri";
import { useIsConfigured } from "./useSettings";

const HOUR = 60 * 60_000;
const norm = (s?: string | null) => s?.trim().toLowerCase() || undefined;

/** Avatares de los usuarios de Plex por nombre de usuario y por nombre visible (en minúsculas). */
export function usePlexAvatars(): Map<string, string> | undefined {
  const plex = useIsConfigured("plex");
  const q = useQuery({
    queryKey: ["plex", "users"],
    queryFn: async () => {
      const map = new Map<string, string>();
      for (const u of await plexUsers()) {
        if (!u.thumb) continue;
        for (const k of [norm(u.username), norm(u.title)]) if (k && !map.has(k)) map.set(k, u.thumb);
      }
      return map;
    },
    enabled: plex === true,
    staleTime: HOUR,
    // Con un token de servidor compartido plex.tv no da la lista: no hay avatares, pero no es un error que mostrar.
    retry: false,
  });
  return q.data;
}

/** Avatar de Plex de un usuario (por su nombre de usuario o nombre visible), si lo tiene. */
export function usePlexAvatar(name?: string | null): string | undefined {
  const map = usePlexAvatars();
  const k = norm(name);
  return k ? map?.get(k) : undefined;
}
