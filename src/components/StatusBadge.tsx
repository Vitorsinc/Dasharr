import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";
import type { Route } from "@/lib/types";

export function StatusBadge({ route }: { route: Route | null | undefined }) {
  const key = route ?? "unknown";
  const style = {
    local: "bg-success/15 text-success",
    remote: "bg-accent/15 text-accent",
    offline: "bg-danger/15 text-danger",
    unknown: "bg-surface-2 text-muted",
  }[key];
  return (
    <span className={cn("chip", style)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t.route[key]}
    </span>
  );
}
