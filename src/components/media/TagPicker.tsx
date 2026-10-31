import { Check } from "lucide-react";
import type { ArrService } from "@/api/arr";
import type { Tag } from "@/api/arrManage";
import { useTags } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

/** Etiquetas como botones que se activan y desactivan (aria-pressed). */
export function TagPicker({
  tags,
  value,
  onChange,
  disabled,
}: {
  tags: Tag[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  if (!tags.length) return <p className="text-xs text-muted">{t.manage.tags.empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.manage.tags.label}>
      {[...tags]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((tag) => {
          const on = value.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={t.manage.tags.toggle(tag.label)}
              onClick={() => onChange(on ? value.filter((id) => id !== tag.id) : [...value, tag.id])}
              className={cn(
                "chip flex items-center gap-1 transition-colors",
                on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {on && <Check className="h-3 w-3" aria-hidden />}
              {tag.label}
            </button>
          );
        })}
    </div>
  );
}

/** Etiquetas de una película o serie en su ficha; cada cambio se guarda al momento. Sin etiquetas en el *arr no se ve. */
export function MediaTags({ service, value, onChange }: { service: ArrService; value: number[]; onChange: (ids: number[]) => void }) {
  const tags = useTags(service);
  if (!tags.data?.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{t.manage.tags.label}</div>
      <TagPicker tags={tags.data} value={value} onChange={onChange} />
    </div>
  );
}
