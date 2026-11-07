import { useState } from "react";
import { Search } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import { Poster } from "@/components/media/PosterCard";
import { RequestDialog, type RequestTarget } from "@/components/seerr/RequestDialog";
import { MediaStatus, titleOf, tmdbImage, yearOf, type DiscoverKind, type SearchResult } from "@/api/seerr";
import { useSeerrDiscover, useSeerrSearch } from "@/hooks/useSeerr";
import { useIsConfigured } from "@/hooks/useSettings";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";

const badge: Record<number, { label: string; dot: string }> = {
  [MediaStatus.Available]: { label: t.seerr.badgeAvailable, dot: "bg-success" },
  [MediaStatus.PartiallyAvailable]: { label: t.seerr.badgePartial, dot: "bg-success" },
  [MediaStatus.Processing]: { label: t.seerr.badgeProcessing, dot: "bg-accent" },
  [MediaStatus.Pending]: { label: t.seerr.badgeRequested, dot: "bg-warning" },
};

const isMedia = (r: SearchResult): r is SearchResult & { mediaType: "movie" | "tv" } => r.mediaType === "movie" || r.mediaType === "tv";

function ResultCard({ item, onPick, className }: { item: SearchResult & { mediaType: "movie" | "tv" }; onPick: (t: RequestTarget) => void; className?: string }) {
  const title = titleOf(item);
  const b = item.mediaInfo ? badge[item.mediaInfo.status] : undefined;
  return (
    <button
      className={cn("group flex flex-col gap-1.5 text-left outline-none", className)}
      onClick={() => onPick({ type: item.mediaType, tmdbId: item.id, title })}
      aria-label={title}
    >
      <div className="relative rounded-lg transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <Poster src={tmdbImage(item.posterPath)} title={title} className="shadow-sm group-hover:shadow-lg" />
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {item.mediaType === "movie" ? t.seerr.movie : t.seerr.tv}
        </span>
        {b && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <span className={cn("h-1.5 w-1.5 rounded-full", b.dot)} />
            {b.label}
          </span>
        )}
      </div>
      <div className="truncate text-sm font-medium" title={title}>
        {title}
      </div>
      <div className="text-xs tabular-nums text-muted">{yearOf(item) || "—"}</div>
    </button>
  );
}

function Row({ kind, onPick }: { kind: DiscoverKind; onPick: (t: RequestTarget) => void }) {
  const q = useSeerrDiscover(kind);
  const items = (q.data?.results ?? []).filter(isMedia);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.seerr.rows[kind]}</h2>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="seerr" error={q.error} onRetry={() => q.refetch()} compact />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((it) => (
            <ResultCard key={`${it.mediaType}-${it.id}`} item={it} onPick={onPick} className="w-36 shrink-0" />
          ))}
        </div>
      )}
    </section>
  );
}

function Results({ query, onPick }: { query: string; onPick: (t: RequestTarget) => void }) {
  const [page, setPage] = useState(1);
  const q = useSeerrSearch(query, page);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="seerr" error={q.error} onRetry={() => q.refetch()} />;
  const items = (q.data?.results ?? []).filter(isMedia);
  if (!items.length) return <Empty>{t.seerr.noResults}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
        {items.map((it) => (
          <ResultCard key={`${it.mediaType}-${it.id}`} item={it} onPick={onPick} />
        ))}
      </div>
      {q.data && q.data.totalPages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t.common.prevPage}
          </button>
          <span className="self-center tabular-nums text-muted">{t.common.pageOf(page, q.data.totalPages)}</span>
          <button className="btn-outline" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}>
            {t.common.nextPage}
          </button>
        </div>
      )}
    </div>
  );
}

const ROWS: DiscoverKind[] = ["trending", "movies", "tv", "upcomingMovies", "upcomingTv"];

/** Seerr → Descubrir: buscar o explorar tendencias y estrenos, y pedir lo que falte. */
export default function DiscoverPage() {
  const configured = useIsConfigured("seerr");
  const [text, setText] = useState("");
  const query = useDebouncedValue(text.trim(), 400);
  const [target, setTarget] = useState<RequestTarget | null>(null);
  return (
    <Page title={t.nav.discover}>
      {configured === false ? (
        <NotConfigured service="seerr" />
      ) : (
        <>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              className="input pl-9"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.seerr.searchPlaceholder}
              aria-label={t.seerr.searchLabel}
              autoFocus
            />
          </div>
          {query ? <Results key={query} query={query} onPick={setTarget} /> : ROWS.map((k) => <Row key={k} kind={k} onPick={setTarget} />)}
          <RequestDialog target={target} onClose={() => setTarget(null)} />
        </>
      )}
    </Page>
  );
}
