import { useState } from "react";
import { cn } from "@/lib/cn";

/** Avatar redondo: prueba cada imagen en orden y, si ninguna carga, muestra la inicial. */
export function Avatar({ name, sources, className }: { name?: string | null; sources: (string | null | undefined)[]; className?: string }) {
  const urls = sources.filter((u): u is string => !!u);
  // Al cambiar las fuentes (p. ej. llegan los avatares de Plex) se vuelve a probar desde la primera.
  const sig = urls.join("|");
  const [state, setState] = useState({ sig, failed: 0 });
  const failed = state.sig === sig ? state.failed : 0;
  const box = cn(
    "grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/20 text-[11px] font-semibold text-accent",
    className,
  );
  const src = urls[failed];
  if (src) return <img key={src} src={src} alt="" className={cn(box, "object-cover")} onError={() => setState({ sig, failed: failed + 1 })} />;
  return (
    <span className={box} aria-hidden>
      {(name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
