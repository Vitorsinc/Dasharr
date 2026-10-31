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
import { fetchOrder, filterSort, isAvailable, libState, MOVIE_SOURCES, type LibFilter, type LibSort } from "@/components/media/library";
import { arrScores, visibleScores } from "@/components/media/RatingBadges";
import { posterUrl, type WantedKind } from "@/api/arr";
import { WantedList } from "@/components/media/WantedList";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { faKey, movieItem } from "@/api/filmaffinity";
import { movieReleaseDate, radarr, type Movie } from "@/api/radarr";
import { useMovies, useRadarrMeta, useRadarrQueue, useRadarrWanted } from "@/hooks/useArr";
import { useFaRatings } from "@/hooks/useFilmAffinity";
import { useTags } from "@/hooks/useArrManage";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { movieDefaultsFor } from "@/lib/anime";
import { MovieDetail } from "./MovieDetail";
import { UpcomingMovies } from "./Upcoming";

type Tab = "library" | "upcoming" | "wanted" | "queue";

export default function MoviesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("library");
  const movies = useMovies();
  const queue = useRadarrQueue(tab === "queue");
  const meta = useRadarrMeta();
  const [wantedKind, setWantedKind] = useState<WantedKind>("missing");
  const wanted = useRadarrWanted(wantedKind, tab === "wanted");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibFilter>("all");
  const [sort, setSort] = useState<LibSort>("title");
  const [tag, setTag] = useState<number | null>(null);
  const tags = useTags("radarr");
  const activeTag = tags.data?.some((x) => x.id === tag) ? tag : null;
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [manualFor, setManualFor] = useState<Movie | null>(null);

  const [{ hiddenRatings, movieDefaults }] = usePrefs();
  const preset = movieDefaultsFor(meta.roots.data ?? [], meta.profiles.data ?? [], movieDefaults);
  const showFa = !hiddenRatings.includes("filmaffinity");
  const sortSources = MOVIE_SOURCES.filter((s) => !hiddenRatings.includes(s));
  const activeSort = isAvailable(sort, sortSources) ? sort : "title";
  const base = useMemo(
    () => (movies.data ?? []).map((m) => ({ ...m, downloaded: m.hasFile, missing: m.monitored && !m.hasFile })),
    [movies.data],
  );
  // FilmAffinity se pide en el orden en que se ve la lista (o por título al ordenar por nota).
  const faItems = useMemo(
    () => (tab === "library" && showFa ? filterSort(base, { query, filter, tag: activeTag, sort: fetchOrder(activeSort) }).map(movieItem) : []),
    [base, tab, showFa, query, filter, activeTag, activeSort],
  );
  const ratings = useFaRatings(faItems);
  const items = useMemo(
    () =>
      filterSort(
        base.map((m) => ({
          ...m,
          scores: visibleScores({ ...arrScores(m.ratings), filmaffinity: ratings[faKey(movieItem(m))]?.rating ?? undefined }, hiddenRatings),
        })),
        { query, filter, tag: activeTag, sort: activeSort },
      ),
    [base, ratings, hiddenRatings, query, filter, activeTag, activeSort],
  );
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
              { value: "upcoming", label: t.premieres.tab },
              { value: "wanted", label: t.wanted.tab },
              { value: "queue", label: t.library.queue },
            ]}
          />
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t.library.addMovie}
          </button>
        </>
      }
    >
      {tab === "upcoming" ? (
        movies.isLoading || movies.configured === undefined ? (
          <Loading />
        ) : movies.isError ? (
          <ErrorPanel service="radarr" error={movies.error} onRetry={() => movies.refetch()} />
        ) : (
          <UpcomingMovies movies={movies.data ?? []} onOpen={setSelectedId} />
        )
      ) : tab === "wanted" ? (
        <WantedList
          service="radarr"
          kind={wantedKind}
          onKind={setWantedKind}
          isLoading={wanted.isLoading}
          error={wanted.error}
          onRetry={() => wanted.refetch()}
          searchAllLabel={t.wanted.searchAll}
          onSearchAll={() =>
            radarr.searchWanted(wantedKind).then(
              () => toast.success(t.wanted.searchAllStarted),
              (e) => toast.error(errorMessage(e, "radarr")),
            )
          }
          rows={(wanted.data ?? []).map((m) => ({
            key: m.id,
            title: `${m.title} (${m.year})`,
            subtitle:
              wantedKind === "cutoff"
                ? t.wanted.current(m.movieFile?.quality?.quality?.name ?? "?")
                : movieReleaseDate(m)
                  ? formatDate(movieReleaseDate(m))
                  : undefined,
            poster: posterUrl("radarr", m, 250),
            onOpen: () => setSelectedId(m.id),
            onAuto: () =>
              radarr.search([m.id]).then(
                () => toast.success(t.library.searchStarted, { description: m.title }),
                (e) => toast.error(errorMessage(e, "radarr")),
              ),
            onManual: () => setManualFor(m),
          }))}
        />
      ) : tab === "queue" ? (
        queue.isLoading ? (
          <Loading />
        ) : queue.isError ? (
          <ErrorPanel service="radarr" error={queue.error} onRetry={() => queue.refetch()} />
        ) : (
          <QueueList service="radarr" records={queue.data ?? []} />
        )
      ) : (
        <>
          <LibraryToolbar
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            sort={activeSort}
            onSort={setSort}
            ratingSources={sortSources}
            tags={tags.data ?? []}
            tag={activeTag}
            onTag={setTag}
          />
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
                  scores={m.scores}
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
        preset={preset}
        profiles={meta.profiles.data ?? []}
        rootFolders={meta.roots.data ?? []}
        manualHint={t.library.addManualMovieHint}
        onAdd={async (m, o) => {
          const added = await radarr.addMovie(m, { ...o, monitored: true });
          await qc.invalidateQueries({ queryKey: ["radarr"] });
          if (o.searchMode === "manual") setManualFor(added);
        }}
        onQuickAdd={async (m, o) => {
          await radarr.addMovie(m, { ...o, monitored: true });
          await qc.invalidateQueries({ queryKey: ["radarr"] });
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
