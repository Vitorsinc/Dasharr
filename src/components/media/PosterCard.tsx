import { useState } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";
import type { LibState } from "./library";

const stateStyle: Record<LibState, { dot: string; label: string }> = {
  downloaded: { dot: "bg-success", label: t.library.statusDownloaded },
  missing: { dot: "bg-danger", label: t.library.statusMissing },
  unmonitored: { dot: "bg-muted", label: t.library.statusUnmonitored },
  partial: { dot: "bg-warning", label: t.library.statusPartial },
};

export function Poster({ src, title, className }: { src?: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2", className)}>
      {src && !failed ? (
        <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted">
          <Film className="h-8 w-8" aria-hidden />
          <span className="line-clamp-3">{title}</span>
        </div>
      )}
    </div>
  );
}

export function PosterCard({
  title,
  subtitle,
  poster,
  state,
  onClick,
}: {
  title: string;
  subtitle?: string;
  poster?: string;
  state?: LibState;
  onClick?: () => void;
}) {
  const s = state ? stateStyle[state] : null;
  return (
    <button onClick={onClick} className="group flex flex-col gap-2 text-left outline-none" aria-label={title}>
      <div className="relative transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent rounded-lg">
        <Poster src={poster} title={title} className="shadow-sm group-hover:shadow-lg" />
        {s && (
          <span
            className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
            title={s.label}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
            {s.label}
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" title={title}>
          {title}
        </div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
    </button>
  );
}

export function PosterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6">{children}</div>;
}
