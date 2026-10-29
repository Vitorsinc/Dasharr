import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented } from "@/components/ui";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { LibraryToolbar } from "@/components/media/LibraryToolbar";
import { PosterCard, PosterGrid } from "@/components/media/PosterCard";
import { QueueList } from "@/components/media/QueueList";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { filterSort, libState, type LibFilter, type LibSort } from "@/components/media/library";
import { posterUrl } from "@/api/arr";
import { faKey, movieItem } from "@/api/filmaffinity";
import { radarr, type Movie } from "@/api/radarr";
import { useMovies, useRadarrMeta, useRadarrQueue } from "@/hooks/useArr";
import { useFaRatings } from "@/hooks/useFilmAffinity";
import { t } from "@/i18n/es";
import { MovieDetail } from "./MovieDetail";

type Tab = "library" | "queue";

export default function MoviesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("library");
  const movies = useMovies();
  const queue = useRadarrQueue(tab === "queue");
  const meta = useRadarrMeta();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibFilter>("all");
  const [sort, setSort] = useState<LibSort>("title");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [manualFor, setManualFor] = useState<Movie | null>(null);

  const items = useMemo(
    () =>
      filterSort(
        (movies.data ?? []).map((m) => ({ ...m, downloaded: m.hasFile, missing: m.monitored && !m.hasFile })),
        { query, filter, sort },
      ),
    [movies.data, query, filter, sort],
  );
  const faItems = useMemo(() => (tab === "library" ? items.map(movieItem) : []), [items, tab]);
  const ratings = useFaRatings(faItems);
  const existing = useMemo(() => new Set((movies.data ?? []).map((m) => m.tmdbId)), [movies.data]);
  const selected = movies.data?.find((m) => m.id === selectedId) ?? null;

  if (movies.configured === false)
    return (
      <Page title={t.nav.movies}>
        <NotConfigured service="radarr" />
      </Page>
    );

  return (
    <Page
      title={t.nav.movies}
      actions={
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "library", label: t.library.library },
              { value: "queue", label: t.library.queue },
            ]}
          />
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t.library.addMovie}
          </button>
        </>
      }
    >
      {tab === "queue" ? (
        queue.isLoading ? (
          <Loading />
        ) : queue.isError ? (
          <ErrorPanel service="radarr" error={queue.error} onRetry={() => queue.refetch()} />
        ) : (
          <QueueList service="radarr" records={queue.data ?? []} />
        )
      ) : (
        <>
          <LibraryToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} />
          {movies.isLoading || movies.configured === undefined ? (
            <Loading />
          ) : movies.isError ? (
            <ErrorPanel service="radarr" error={movies.error} onRetry={() => movies.refetch()} />
          ) : items.length === 0 ? (
            <Empty>{t.library.emptyLibrary}</Empty>
          ) : (
            <PosterGrid>
              {items.map((m) => (
                <PosterCard
                  key={m.id}
                  title={m.title}
                  subtitle={String(m.year)}
                  poster={posterUrl("radarr", m)}
                  state={libState(m)}
                  rating={ratings[faKey(movieItem(m))]?.rating}
                  onClick={() => setSelectedId(m.id)}
                />
              ))}
            </PosterGrid>
          )}
        </>
      )}
      <MovieDetail movie={selected} onClose={() => setSelectedId(null)} />
      <AddMediaDialog<Movie>
        open={adding}
        onOpenChange={setAdding}
        title={t.library.addMovie}
        lookup={radarr.lookup}
        toItem={(m) => ({
          key: m.tmdbId,
          title: m.title,
          year: m.year,
          overview: m.overview,
          poster: posterUrl("radarr", { images: m.images }),
          exists: existing.has(m.tmdbId),
        })}
        profiles={meta.profiles.data ?? []}
        rootFolders={meta.roots.data ?? []}
        manualHint={t.library.addManualMovieHint}
        onAdd={async (m, o) => {
          const added = await radarr.addMovie(m, { ...o, monitored: true });
          await qc.invalidateQueries({ queryKey: ["radarr"] });
          if (o.searchMode === "manual") setManualFor(added);
        }}
      />
      <ReleaseSearchDialog
        service="radarr"
        query={manualFor ? { movieId: manualFor.id } : null}
        what={manualFor?.title ?? ""}
        onClose={() => setManualFor(null)}
      />
    </Page>
  );
}
