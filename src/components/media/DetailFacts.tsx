import type { ReactNode } from "react";

/** Bloque con título pequeño para la columna del póster en las fichas («Valoraciones», «Detalles»). Se oculta si no queda ninguna línea. */
export function FactSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 [&:not(:has(dd))]:hidden">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  );
}

/** Una línea «etiqueta … valor» de la columna del póster. No pinta nada sin valor. */
export function Fact({ label, value, title }: { label: string; value?: ReactNode; title?: string }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm" title={title}>
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}
