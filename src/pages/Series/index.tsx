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
import { filterSort, libState, type LibFilter, type LibSort } from "@/components/media/library";
import { posterUrl } from "@/api/arr";
import { sonarr, type MonitorOption, type Series, type SeriesType } from "@/api/sonarr";
import { useSeries, useSonarrMeta, useSonarrQueue } from "@/hooks/useArr";
import { usePrefs } from "@/hooks/usePrefs";
import { t } from "@/i18n/es";
import { defaultsFor, kindOf, looksLikeAnime, seriesTypeLabel, typeForKind, type SeriesKind } from "@/lib/anime";
import { SeriesDetail } from "./SeriesDetail";

type Tab = "library" | "queue";

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibFilter>("all");
  const [sort, setSort] = useState<LibSort>("title");
  const [adding, setAdding] = useState(false);
  const [monitor, setMonitor] = useState<MonitorOption>("all");
  const [seriesType, setSeriesType] = useState<SeriesType>(typeForKind(kind));
  const [{ seriesDefaults }] = usePrefs();
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
  const addKind: SeriesKind = seriesType === "anime" ? "anime" : "series";
  const preset = defaultsFor(addKind, meta.roots.data ?? [], meta.profiles.data ?? [], seriesDefaults[addKind]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const items = useMemo(
    () =>
      filterSort(
        mine.map((s) => ({ ...s, ...seriesLibFlags(s) })),
        { query, filter, sort },
      ),
    [mine, query, filter, sort],
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
      {tab === "queue" ? (
        queue.isLoading ? (
          <Loading />
        ) : queue.isError ? (
          <ErrorPanel service="sonarr" error={queue.error} onRetry={() => queue.refetch()} />
        ) : (
          <QueueList service="sonarr" records={queueRecords} />
        )
      ) : (
        <>
          <LibraryToolbar series query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} />
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
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </PosterGrid>
          )}
        </>
      )}
      <SeriesDetail series={selected} onClose={() => setSelectedId(null)} />
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
        onAdd={async (s, o) => {
          await sonarr.addSeries(s, { ...o, monitor, seriesType });
          await qc.invalidateQueries({ queryKey: ["sonarr"] });
        }}
      />
    </Page>
  );
}
