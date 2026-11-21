import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { openExternal } from "@/lib/tauri";
import { markAllErrorsRead, markErrorRead, useErrors, type ErrorEntry } from "@/lib/errorLog";

const dot = { error: "bg-danger", warning: "bg-warning", notice: "bg-muted" } as const;

const time = (ms: number) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

function Row({ e }: { e: ErrorEntry }) {
  return (
    <li className="group flex gap-2 px-3 py-2.5">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[e.level ?? "error"])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs text-muted">
          <span className="truncate font-semibold text-fg">{e.source ?? t.errorBell.general}</span>
          {e.count > 1 && <span className="chip bg-danger/15 px-1.5 py-0 text-danger">{t.errorBell.times(e.count)}</span>}
          <span className="ml-auto shrink-0 tabular-nums">{time(e.lastAt)}</span>
        </div>
        <p className="mt-0.5 break-words text-sm leading-snug [overflow-wrap:anywhere]">{e.message}</p>
      </div>
      {e.link && (
        <button
          type="button"
          onClick={() => openExternal(e.link!)}
          className="btn-ghost h-7 w-7 shrink-0 self-center p-0 text-muted hover:text-fg"
          title={t.health.more}
          aria-label={t.health.more}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => markErrorRead(e.id)}
        className="btn-ghost h-7 w-7 shrink-0 self-center p-0 text-muted hover:text-fg"
        title={t.errorBell.markRead}
        aria-label={t.errorBell.markRead}
      >
        <Check className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Campanita junto al nombre de Dasharr con los errores de la sesión; cada uno se puede marcar como leído. */
export function ErrorBell() {
  const errors = useErrors();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const n = errors.length;
  // Rojo si hay algún error; si solo hay advertencias de los servicios, ámbar.
  const severe = errors.some((e) => (e.level ?? "error") === "error");

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.errorBell.button(n)}
        title={t.errorBell.button(n)}
        className={cn(
          "btn-ghost relative h-8 w-8 p-0",
          n ? (severe ? "text-danger" : "text-warning") : "text-muted hover:text-fg",
          open && "bg-surface-2",
        )}
      >
        <Bell className={cn("h-[18px] w-[18px]", n > 0 && (severe ? "fill-danger/20" : "fill-warning/20"))} aria-hidden />
        {n > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-surface",
              severe ? "bg-danger text-white" : "bg-warning text-bg",
            )}
            aria-hidden
          >
            {n > 9 ? "9+" : n}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.errorBell.title}
          className="card fixed inset-x-3 top-16 z-50 flex max-h-[min(28rem,70vh)] flex-col shadow-2xl md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-2 md:w-80"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="font-display text-base font-bold [font-stretch:78%]">{t.errorBell.title}</h2>
            {n > 0 && (
              <button type="button" onClick={markAllErrorsRead} className="btn-ghost ml-auto px-2 py-1 text-xs">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                {t.errorBell.markAllRead}
              </button>
            )}
          </div>
          {n === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">{t.errorBell.empty}</p>
          ) : (
            <>
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {errors.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </ul>
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted">{t.errorBell.hint}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
