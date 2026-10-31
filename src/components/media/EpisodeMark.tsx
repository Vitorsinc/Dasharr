import type { EpisodeStatus } from "@/api/sonarr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

const label: Record<EpisodeStatus, string> = {
  downloaded: t.library.epDownloaded,
  missing: t.library.epMissing,
  unaired: t.library.epUnaired,
};

/**
 * Número del episodio coloreado según su estado (el texto queda en el tooltip):
 * relleno verde = descargado, borde rojo = falta, borde gris = sin emitir.
 */
export function EpisodeMark({ status, number }: { status: EpisodeStatus; number: number }) {
  const title = label[status];
  return (
    <span
      title={title}
      aria-label={`${number} · ${title}`}
      className={cn(
        "flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
        status === "downloaded" && "bg-success/20 text-success",
        status === "missing" && "text-danger ring-1 ring-inset ring-danger/60",
        status === "unaired" && "text-muted ring-1 ring-inset ring-border",
      )}
    >
      {number}
    </span>
  );
}
