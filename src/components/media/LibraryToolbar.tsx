import { CheckSquare, Search } from "lucide-react";
import { Segmented } from "@/components/ui";
import { t } from "@/i18n/es";
import type { RatingSource } from "@/hooks/usePrefs";
import type { Tag } from "@/api/arrManage";
import type { LibFilter, LibSort } from "./library";
import { ratingName } from "./RatingBadges";

export function LibraryToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  sort,
  onSort,
  series,
  ratingSources = [],
  tags = [],
  tag = null,
  onTag,
  selecting,
  onSelecting,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: LibFilter;
  onFilter: (v: LibFilter) => void;
  sort: LibSort;
  onSort: (v: LibSort) => void;
  series?: boolean;
  /** Notas visibles por las que se puede ordenar. */
  ratingSources?: RatingSource[];
  /** Etiquetas del *arr para filtrar; sin etiquetas no se ve el filtro. */
  tags?: Tag[];
  tag?: number | null;
  onTag?: (id: number | null) => void;
  /** Modo selección para la edición masiva. */
  selecting?: boolean;
  onSelecting?: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          className="input pl-9"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.library.searchPlaceholder}
          aria-label={t.library.searchPlaceholder}
        />
      </div>
      <Segmented<LibFilter>
        label="Filtro"
        value={filter}
        onChange={onFilter}
        options={[
          { value: "all", label: series ? t.library.allSeries : t.library.all },
          { value: "downloaded", label: series ? t.library.downloadedSeries : t.library.downloaded },
          { value: "missing", label: t.library.missing },
          { value: "monitored", label: t.library.monitored },
        ]}
      />
      {tags.length > 0 && onTag && (
        <select
          className="input w-auto"
          aria-label={t.manage.tags.filter}
          value={tag ?? ""}
          onChange={(e) => onTag(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t.manage.tags.allTags}</option>
          {[...tags]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
        </select>
      )}
      <label className="ml-auto flex items-center gap-2 text-sm text-muted">
        {t.library.sortBy}
        <select className="input w-auto" value={sort} onChange={(e) => onSort(e.target.value as LibSort)}>
          <option value="title">{t.library.sortTitle}</option>
          <option value="added">{t.library.sortAdded}</option>
          <option value="year">{t.library.sortYear}</option>
          {ratingSources.map((s) => (
            <option key={s} value={`rating:${s}`}>
              {t.library.sortRating(ratingName(s))}
            </option>
          ))}
        </select>
      </label>
      {onSelecting && (
        <button
          className={selecting ? "btn-primary" : "btn-outline"}
          aria-pressed={!!selecting}
          title={t.bulk.selectHint}
          onClick={() => onSelecting(!selecting)}
        >
          <CheckSquare className="h-4 w-4" aria-hidden /> {t.bulk.select}
        </button>
      )}
    </div>
  );
}
