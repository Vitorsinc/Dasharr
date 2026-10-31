import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TabLink {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/** Pestañas que son rutas (`base` para la primera, `base/id` para el resto), como en Ajustes. */
export function TabNav({ tabs, current, base, label }: { tabs: TabLink[]; current: string; base: string; label: string }) {
  return (
    <nav className="-mt-2 flex flex-wrap gap-1 border-b border-border" aria-label={label}>
      {tabs.map(({ id, label: text, icon: Icon }) => (
        <Link
          key={id}
          to={id === tabs[0].id ? base : `${base}/${id}`}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            id === current ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          {text}
        </Link>
      ))}
    </nav>
  );
}
