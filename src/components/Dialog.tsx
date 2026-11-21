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
  backdrop,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  /** true = ancho; "xl" = extra ancho (tablas como la búsqueda manual). */
  wide?: boolean | "xl";
  /** Imagen de fondo (fanart) detrás del contenido, difuminada hacia el color de la tarjeta. */
  backdrop?: string;
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
            // En el móvil, los diálogos anchos (fichas, búsquedas) ocupan toda la pantalla.
            wide &&
              "max-md:inset-0 max-md:h-full max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0",
            backdrop && "overflow-hidden",
          )}
        >
          {backdrop && <Backdrop src={backdrop} />}
          <div className="relative flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
            <RD.Title className="text-base font-semibold">{title}</RD.Title>
            <RD.Close className="btn-ghost p-1.5" aria-label={t.common.close}>
              <X className="h-4 w-4" />
            </RD.Close>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto p-4 md:p-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Fanart a todo el diálogo, con un velo del color de la tarjeta para que el texto se lea en tema claro y oscuro. */
function Backdrop({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden data-testid="dialog-backdrop">
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        className={cn("h-full w-full object-cover object-top transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-surface/55 via-surface/85 to-surface" />
    </div>
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
  danger = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  checkboxLabel?: string;
  onConfirm: (checked: boolean) => void;
  /** false = acción normal (botón principal en vez de rojo). */
  danger?: boolean;
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
            className={danger ? "btn-danger" : "btn-primary"}
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
