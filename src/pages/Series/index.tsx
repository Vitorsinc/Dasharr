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
import { fetchOrder, filterSort, isAvailable, libState, SERIES_SOURCES, type LibFilter, type LibSort } from "@/components/media/library";
import { arrScores, visibleScores } from "@/components/media/RatingBadges";
import { posterUrl, type ReleaseQuery, type WantedKind } from "@/api/arr";
import { WantedList } from "@/components/media/WantedList";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { faKey, seriesItem } from "@/api/filmaffinity";
import { sonarr, type MonitorOption, type Series, type SeriesType } from "@/api/sonarr";
import { useSeries, useSonarrMeta, useSonarrQueue, useSonarrWanted } from "@/hooks/useArr";
import { usePrefs } from "@/hooks/usePrefs";
import { useFaRatings } from "@/hooks/useFilmAffinity";
import { useRun, useTags } from "@/hooks/useArrManage";
import { BulkEditBar } from "@/components/media/BulkEditBar";
import { t } from "@/i18n/es";
import { defaultsFor, kindOf, looksLikeAnime, seriesTypeLabel, typeForKind, type SeriesKind } from "@/lib/anime";
import { SeriesDetail } from "./SeriesDetail";

type Tab = "library" | "wanted" | "queue";

const pad = (n: number) => String(n).padStart(2, "0");

export function seriesLibFlags(s: Series) {
  const have = s.statistics?.episodeFileCount ?? 0;
  const total = s.statistics?.episodeCount ?? 0;
  return { downloaded: total > 0 && have >= total, missing: s.monitored && have < total };
}

/** Series y Anime son la misma biblioteca de Sonarr separada por el tipo de serie. */
export default function SeriesPage({ kind = "series" }: { kind?: SeriesKind }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("library");
  const series = useSeries();
  const queue = useSonarrQueue(tab === "queue");
  const meta = useSonarrMeta();
  const [wantedKind, setWantedKind] = useState<WantedKind>("missing");
  const wanted = useSonarrWanted(wantedKind, tab === "wanted");
  const [manual, setManual] = useState<{ query: ReleaseQuery; what: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibFilter>("all");
  const [sort, setSort] = useState<LibSort>("title");
  const [tag, setTag] = useState<number | null>(null);
  const tags = useTags("sonarr");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const run = useRun("sonarr");
  const togglePick = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelection = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const activeTag = tags.data?.some((x) => x.id === tag) ? tag : null;
  const [adding, setAdding] = useState(false);
  const [monitor, setMonitor] = useState<MonitorOption>("all");
  const [seriesType, setSeriesType] = useState<SeriesType>(typeForKind(kind));
  const [{ seriesDefaults, hiddenRatings }] = usePrefs();
  const title = kind === "anime" ? t.nav.anime : t.nav.series;
  const addLabel = kind === "anime" ? t.library.addAnime : t.library.addSeries;

  const mine = useMemo(() => (series.data ?? []).filter((s) => kindOf(s) === kind), [series.data, kind]);
  const mineIds = useMemo(() => new Set(mine.map((s) => s.id)), [mine]);
  const otherIds = useMemo(() => new Set((series.data ?? []).filter((s) => !mineIds.has(s.id)).map((s) => s.id)), [series.data, mineIds]);
  // Lo que Sonarr no ha asociado a ninguna serie se ve en las dos secciones.
  const queueRecords = useMemo(
    () => (queue.data ?? []).filter((r) => r.seriesId == null || !otherIds.has(r.seriesId)),
    [queue.data, otherIds],
  );
  // Buscadas de esta sección: las de Anime en Anime y el resto en Series.
  const wantedEpisodes = useMemo(
    () => (wanted.data ?? []).filter((e) => (e.series ? kindOf(e.series) === kind : !otherIds.has(e.seriesId))),
    [wanted.data, kind, otherIds],
  );
  const addKind: SeriesKind = seriesType === "anime" ? "anime" : "series";
  const preset = defaultsFor(addKind, meta.roots.data ?? [], meta.profiles.data ?? [], seriesDefaults[addKind]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const showFa = !hiddenRatings.includes("filmaffinity");
  const sortSources = SERIES_SOURCES.filter((s) => !hiddenRatings.includes(s));
  const activeSort = isAvailable(sort, sortSources) ? sort : "title";
  const base = useMemo(() => mine.map((s) => ({ ...s, ...seriesLibFlags(s) })), [mine]);
  // FilmAffinity se pide en el orden en que se ve la lista (o por título al ordenar por nota).
  const faItems = useMemo(
    () => (tab === "library" && showFa ? filterSort(base, { query, filter, tag: activeTag, sort: fetchOrder(activeSort) }).map(seriesItem) : []),
    [base, tab, showFa, query, filter, activeTag, activeSort],
  );
  const ratings = useFaRatings(faItems);
  const items = useMemo(
    () =>
      filterSort(
        base.map((s) => ({
          ...s,
          scores: visibleScores({ ...arrScores({ tvdb: s.ratings }), filmaffinity: ratings[faKey(seriesItem(s))]?.rating ?? undefined }, hiddenRatings),
        })),
        { query, filter, tag: activeTag, sort: activeSort },
      ),
    [base, ratings, hiddenRatings, query, filter, activeTag, activeSort],
  );
  const existing = useMemo(() => new Set((series.data ?? []).map((s) => s.tvdbId)), [series.data]);
  const selected = series.data?.find((s) => s.id === selectedId) ?? null;

  if (series.configured === false)
    return (
      <Page title={title}>
        <NotConfigured service="sonarr" />
      </Page>
    );

  return (
    <Page
      title={title}
      actions={
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "library", label: t.library.library },
              { value: "wanted", label: t.wanted.tab },
              { value: "queue", label: t.library.queue },
            ]}
          />
          <button
            className="btn-primary"
            onClick={() => {
              setSeriesType(typeForKind(kind));
              setAdding(true);
            }}
          >
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
        </>
      }
    >
      {tab === "wanted" ? (
        <WantedList
          service="sonarr"
          kind={wantedKind}
          onKind={setWantedKind}
          isLoading={wanted.isLoading}
          error={wanted.error}
          onRetry={() => wanted.refetch()}
          searchAllLabel={t.wanted.searchAllEpisodes}
          onSearchAll={() =>
            sonarr.searchEpisodes(wantedEpisodes.map((e) => e.id)).then(
              () => toast.success(t.wanted.searchAllStarted),
              (err) => toast.error(errorMessage(err, "sonarr")),
            )
          }
          rows={wantedEpisodes.map((e) => {
            const code = `${e.seasonNumber}x${pad(e.episodeNumber)}`;
            const name = `${e.series?.title ?? ""} · ${code}`;
            return {
              key: e.id,
              title: `${name} · ${e.title}`,
              subtitle:
                wantedKind === "cutoff"
                  ? t.wanted.current(e.episodeFile?.quality?.quality?.name ?? "?")
                  : e.airDateUtc
                    ? t.wanted.aired(formatDate(e.airDateUtc))
                    : undefined,
              poster: e.series ? posterUrl("sonarr", e.series, 250) : undefined,
              onOpen: () => setSelectedId(e.seriesId),
              onAuto: () =>
                sonarr.searchEpisodes([e.id]).then(
                  () => toast.success(t.library.searchStarted, { description: name }),
                  (err) => toast.error(errorMessage(err, "sonarr")),
                ),
              onManual: () => setManual({ query: { episodeId: e.id }, what: name }),
            };
          })}
        />
      ) : tab === "queue" ? (
        queue.isLoading ? (
          <Loading />
        ) : queue.isError ? (
          <ErrorPanel service="sonarr" error={queue.error} onRetry={() => queue.refetch()} />
        ) : (
          <QueueList service="sonarr" records={queueRecords} />
        )
      ) : (
        <>
          <LibraryToolbar
            series
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
            selecting={selecting}
            onSelecting={(v) => (v ? setSelecting(true) : exitSelection())}
          />
          {series.isLoading || series.configured === undefined ? (
            <Loading />
          ) : series.isError ? (
            <ErrorPanel service="sonarr" error={series.error} onRetry={() => series.refetch()} />
          ) : items.length === 0 ? (
            <Empty>{t.library.emptyLibrary}</Empty>
          ) : (
            <PosterGrid>
              {items.map((s) => (
                <PosterCard
                  key={s.id}
                  title={s.title}
                  subtitle={s.statistics ? t.library.episodes(s.statistics.episodeFileCount, s.statistics.episodeCount) : String(s.year)}
                  poster={posterUrl("sonarr", s)}
                  state={libState(s)}
                  scores={s.scores}
                  selected={selecting ? picked.has(s.id) : undefined}
                  onClick={() => (selecting ? togglePick(s.id) : setSelectedId(s.id))}
                />
              ))}
            </PosterGrid>
          )}
          {selecting && (
            <BulkEditBar
              service="sonarr"
              count={picked.size}
              visible={items.length}
              profiles={meta.profiles.data ?? []}
              rootFolders={meta.roots.data ?? []}
              exclusionLabel={t.library.addExclusion}
              onSelectAll={() => setPicked(new Set(items.map((s) => s.id)))}
              onClear={() => setPicked(new Set())}
              onExit={exitSelection}
              onApply={(e) => run(() => sonarr.editSeries([...picked], e), t.bulk.applied(picked.size))}
              onDelete={async (o) => {
                const ok = await run(() => sonarr.deleteSeriesBulk([...picked], o), t.bulk.deleted(picked.size));
                if (ok) setPicked(new Set());
                return ok;
              }}
            />
          )}
        </>
      )}
      <SeriesDetail series={selected} onClose={() => setSelectedId(null)} />
      <ReleaseSearchDialog service="sonarr" query={manual?.query ?? null} what={manual?.what ?? ""} onClose={() => setManual(null)} />
      <AddMediaDialog<Series>
        open={adding}
        onOpenChange={setAdding}
        title={addLabel}
        lookup={sonarr.lookup}
        toItem={(s) => ({
          key: s.tvdbId,
          title: s.title,
          year: s.year,
          overview: s.overview,
          poster: posterUrl("sonarr", { images: s.images }),
          exists: existing.has(s.tvdbId),
          tag: looksLikeAnime(s) ? t.library.typeAnime : undefined,
        })}
        preset={preset}
        onPick={(s) => setSeriesType(kind === "anime" || looksLikeAnime(s) ? "anime" : s.seriesType === "daily" ? "daily" : "standard")}
        profiles={meta.profiles.data ?? []}
        rootFolders={meta.roots.data ?? []}
        extra={
          <>
            <label>
              <span className="label">{t.library.seriesType}</span>
              <select className="input" value={seriesType} onChange={(e) => setSeriesType(e.target.value as SeriesType)}>
                {(Object.keys(seriesTypeLabel) as SeriesType[]).map((v) => (
                  <option key={v} value={v}>
                    {seriesTypeLabel[v]}
                  </option>
                ))}
              </select>
              {seriesType === "anime" && <span className="mt-1 block text-xs text-muted">{t.library.typeHint}</span>}
            </label>
            <label>
              <span className="label">{t.library.monitor}</span>
              <select className="input" value={monitor} onChange={(e) => setMonitor(e.target.value as MonitorOption)}>
                <option value="all">{t.library.monitorAll}</option>
                <option value="future">{t.library.monitorFuture}</option>
                <option value="latestSeason">{t.library.monitorLatest}</option>
              </select>
            </label>
          </>
        }
        manualHint={t.library.addManualSeriesHint}
        onAdd={async (s, o) => {
          const added = await sonarr.addSeries(s, { ...o, monitor, seriesType });
          await qc.invalidateQueries({ queryKey: ["sonarr"] });
          if (o.searchMode === "manual") setSelectedId(added.id);
        }}
        onQuickAdd={async (s, o) => {
          const type: SeriesType = kind === "anime" || looksLikeAnime(s) ? "anime" : s.seriesType === "daily" ? "daily" : "standard";
          const d = defaultsFor(type === "anime" ? "anime" : "series", meta.roots.data ?? [], meta.profiles.data ?? [], seriesDefaults[type === "anime" ? "anime" : "series"]);
          await sonarr.addSeries(s, {
            ...o,
            qualityProfileId: d.qualityProfileId ?? o.qualityProfileId,
            rootFolderPath: d.rootFolderPath ?? o.rootFolderPath,
            monitor,
            seriesType: type,
          });
          await qc.invalidateQueries({ queryKey: ["sonarr"] });
        }}
      />
    </Page>
  );
}
