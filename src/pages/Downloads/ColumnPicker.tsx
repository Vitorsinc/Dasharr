import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { columnDefs, DEFAULT_DOWNLOAD_COLUMNS, DOWNLOAD_COLUMNS, type DownloadColumn } from "./columns";

/** Botón «Columnas» con la lista de columnas que se pueden mostrar u ocultar. */
export function ColumnPicker({ value, onChange }: { value: DownloadColumn[]; onChange: (cols: DownloadColumn[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (c: DownloadColumn) => onChange(DOWNLOAD_COLUMNS.filter((x) => (x === c ? !value.includes(c) : value.includes(x))));
  const isDefault = value.length === DEFAULT_DOWNLOAD_COLUMNS.length && value.every((c) => DEFAULT_DOWNLOAD_COLUMNS.includes(c));

  return (
    <div className="relative" ref={ref}>
      <button
        className={cn("btn-ghost border border-border bg-surface px-3 py-1.5 text-sm", open && "bg-surface-2")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Columns3 className="h-4 w-4" aria-hidden /> {t.downloads.columns}
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-1 w-60 p-2 shadow-lg" role="group" aria-label={t.downloads.columns}>
          <p className="px-2 pb-2 pt-1 text-xs text-muted">{t.downloads.columnsHint}</p>
          <ul>
            {DOWNLOAD_COLUMNS.map((c) => (
              <li key={c}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={value.includes(c)} onChange={() => toggle(c)} />
                  {columnDefs[c].label}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-border px-2 pt-2">
            <button
              className="text-xs text-muted hover:text-accent disabled:opacity-50 disabled:hover:text-muted"
              disabled={isDefault}
              onClick={() => onChange(DEFAULT_DOWNLOAD_COLUMNS)}
            >
              {t.downloads.columnsReset}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
