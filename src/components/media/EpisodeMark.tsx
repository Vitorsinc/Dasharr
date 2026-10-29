import { Check, Clock, X } from "lucide-react";
import type { EpisodeStatus } from "@/api/sonarr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

export type EpisodeMarkStyle = "dot" | "number" | "icon";

const label: Record<EpisodeStatus, string> = {
  downloaded: t.library.epDownloaded,
  missing: t.library.epMissing,
  unaired: t.library.epUnaired,
};

/** Estado del episodio en mínimo espacio, junto a su número (el texto queda en el tooltip). */
export function EpisodeMark({ status, number, variant = "dot" }: { status: EpisodeStatus; number: number; variant?: EpisodeMarkStyle }) {
  const title = label[status];
  if (variant === "number")
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
  if (variant === "icon") {
    const Icon = status === "downloaded" ? Check : status === "missing" ? X : Clock;
    return (
      <span className="flex w-10 shrink-0 items-center gap-1.5 tabular-nums text-muted" title={title} aria-label={`${number} · ${title}`}>
        <span className="w-4 text-right">{number}</span>
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            status === "downloaded" ? "text-success" : status === "missing" ? "text-danger" : "text-muted/70",
          )}
          strokeWidth={2.75}
        />
      </span>
    );
  }
  return (
    <span className="flex w-9 shrink-0 items-center gap-2 tabular-nums text-muted" title={title} aria-label={`${number} · ${title}`}>
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          status === "downloaded" && "bg-success",
          status === "missing" && "bg-danger",
          status === "unaired" && "ring-1 ring-inset ring-muted/60",
        )}
      />
      {number}
    </span>
  );
}
