import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, ProgressBar, Segmented } from "@/components/ui";
import { Poster, PosterGrid } from "@/components/media/PosterCard";
import { MonitorIcon } from "@/components/media/MonitorToggle";
import { posterUrl } from "@/api/arr";
import type { Collection } from "@/api/radarr";
import { useCollections, useMovies } from "@/hooks/useArr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { CollectionDetail, collectionCounts } from "./CollectionDetail";

type Filter = "all" | "incomplete" | "complete" | "monitored";
type Sort = "title" | "missing";

function matches(c: Collection, f: Filter) {
  if (f === "incomplete") return c.missingMovies > 0;
  if (f === "complete") return c.missingMovies === 0;
  if (f === "monitored") return c.monitored;
  return true;
}

function CollectionCard({ c, onClick }: { c: Collection; onClick: () => void }) {
  const { have, total } = collectionCounts(c);
  const complete = c.missingMovies === 0;
  return (
    <button onClick={onClick} className="group flex flex-col gap-2 text-left outline-none" aria-label={c.title}>
      <div className="relative rounded-lg transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <Poster src={posterUrl("radarr", { images: c.images })} title={c.title} className="shadow-sm group-hover:shadow-lg" />
        <span
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
          title={t.collections.have(have, total)}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", complete ? "bg-success" : "bg-warning")} />
          {complete ? t.collections.completeBadge : t.collections.missingCount(c.missingMovies)}
        </span>
        {c.monitored && (
          <span
            className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white backdrop-blur"
            title={t.library.monitoredLabel}
            aria-label={t.library.monitoredLabel}
          >
            <MonitorIcon monitored className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" title={c.title}>
          {c.title}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ProgressBar value={total ? have / total : 1} tone={complete ? "success" : "accent"} className="h-1" />
          <span className="shrink-0 text-xs tabular-nums text-muted">{t.collections.haveShort(have, total)}</span>
        </div>
      </div>
    </button>
  );
}

export default function CollectionsPage() {
  const collections = useCollections();
  const movies = useMovies();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("title");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (collections.data ?? []).filter(
      (c) => matches(c, filter) && (!q || c.title.toLowerCase().includes(q) || c.movies.some((m) => m.title.toLowerCase().includes(q))),
    );
    const byTitle = (a: Collection, b: Collection) => (a.sortTitle ?? a.title).localeCompare(b.sortTitle ?? b.title, "es");
    return list.sort(sort === "missing" ? (a, b) => b.missingMovies - a.missingMovies || byTitle(a, b) : byTitle);
  }, [collections.data, query, filter, sort]);

  // La colección abierta va en la URL (?c=tmdbId) para poder llegar desde la ficha de una película.
  const openTmdb = Number(params.get("c")) || null;
  const selected = collections.data?.find((c) => c.tmdbId === openTmdb) ?? null;
  const open = (c: Collection | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (c) n.set("c", String(c.tmdbId));
        else n.delete("c");
        return n;
      },
      { replace: true },
    );

  if (collections.configured === false)
    return (
      <Page title={t.nav.collections}>
        <NotConfigured service="radarr" />
      </Page>
    );

  return (
    <Page title={t.nav.collections}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.collections.searchPlaceholder}
            aria-label={t.collections.searchPlaceholder}
          />
        </div>
        <Segmented<Filter>
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t.collections.all },
            { value: "incomplete", label: t.collections.incomplete },
            { value: "complete", label: t.collections.complete },
            { value: "monitored", label: t.collections.monitored },
          ]}
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          {t.library.sortBy}
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="title">{t.collections.sortTitle}</option>
            <option value="missing">{t.collections.sortMissing}</option>
          </select>
        </label>
      </div>
      {collections.isLoading || collections.configured === undefined ? (
        <Loading />
      ) : collections.isError ? (
        <ErrorPanel service="radarr" error={collections.error} onRetry={() => collections.refetch()} />
      ) : items.length === 0 ? (
        <Empty>{collections.data?.length ? t.collections.empty : t.collections.emptyAll}</Empty>
      ) : (
        <PosterGrid>
          {items.map((c) => (
            <CollectionCard key={c.id} c={c} onClick={() => open(c)} />
          ))}
        </PosterGrid>
      )}
      <CollectionDetail collection={selected} library={movies.data ?? []} onClose={() => open(null)} />
    </Page>
  );
}
