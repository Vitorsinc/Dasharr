import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  /** true = ancho; "xl" = extra ancho (tablas como la búsqueda manual). */
  wide?: boolean | "xl";
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <RD.Content
          aria-describedby={undefined}
          className={cn(
            "card fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col shadow-2xl outline-none",
            wide === "xl" ? "max-w-6xl" : wide ? "max-w-4xl" : "max-w-lg",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <RD.Title className="text-base font-semibold">{title}</RD.Title>
            <RD.Close className="btn-ghost p-1.5" aria-label={t.common.close}>
              <X className="h-4 w-4" />
            </RD.Close>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Diálogo de confirmación para acciones destructivas, con casilla opcional (p. ej. "borrar también los archivos"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = t.common.delete,
  checkboxLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  checkboxLabel?: string;
  onConfirm: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted">{message}</div>
        {checkboxLabel && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--danger))]"
            />
            {checkboxLabel}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              onConfirm(checked);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
