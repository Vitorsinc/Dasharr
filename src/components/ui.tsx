import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted", className)} aria-label={t.common.loading} />;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Spinner /> {t.common.loading}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  return <div className="py-16 text-center text-sm text-muted">{children ?? t.common.empty}</div>;
}

export function ProgressBar({
  value,
  className,
  tone = "accent",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "neutral" | "success" | "warning" | "danger";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = { accent: "bg-accent", neutral: "bg-muted", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Anterior / siguiente para las listas paginadas del *arr. No se ve si todo cabe en una página. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t.common.pagination}>
      <button className="btn-outline px-2.5 py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t.common.prevPage}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="tabular-nums text-muted">{t.common.pageOf(page, pages)}</span>
      <button className="btn-outline px-2.5 py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t.common.nextPage}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/**
 * Campo numérico entero que deja escribir libremente (vacío, «-» al empezar un negativo) y solo avisa
 * con números válidos.
 */
export function NumberInput({
  value,
  onValue,
  ...rest
}: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((cur) => (cur.trim() !== "" && Number(cur) === value ? cur : String(value)));
  }, [value]);
  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(Math.round(n));
      }}
    />
  );
}
