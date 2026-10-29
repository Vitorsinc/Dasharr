import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { FaInfo } from "@/components/media/FilmAffinity";
import { Poster } from "@/components/media/PosterCard";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { SearchChoice } from "@/components/media/SearchChoice";
import { EpisodeMark, type EpisodeMarkStyle } from "@/components/media/EpisodeMark";
import { MonitorIcon, MonitorToggle } from "@/components/media/MonitorToggle";

/** Cómo se marca el estado del episodio junto a su número. */
const MARK: EpisodeMarkStyle = "dot";
import { Loading, ProgressBar } from "@/components/ui";
import { posterUrl, type ReleaseQuery } from "@/api/arr";
import { PlexBadge } from "@/components/plex/PlexBadge";
import { seriesItem } from "@/api/filmaffinity";
import { episodeStatus, sonarr, type Episode, type Series, type SeriesType } from "@/api/sonarr";
import { useEpisodes } from "@/hooks/useArr";
import { useMediaHistory } from "@/hooks/useTracearr";
import { episodeKey, playsByEpisode, showRefs, type Play } from "@/api/tracearr";
import { EpisodeViewersButton, PlayList, SeriesWatchSummary } from "@/components/watch/WatchHistory";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { seriesTypeLabel } from "@/lib/anime";

function SeasonBlock({
  series,
  season,
  episodes,
  run,
  onManual,
  watch,
}: {
  series: Series;
  season: number;
  episodes: Episode[];
  /** Reproducciones de Tracearr por episodio (`"1x3"`); undefined sin Tracearr. */
  watch?: Map<string, Play[]>;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
  onManual: (q: ReleaseQuery, what: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openEp, setOpenEp] = useState<number | null>(null);
  const have = episodes.filter((e) => e.hasFile).length;
  const aired = episodes.filter((e) => episodeStatus(e) !== "unaired").length;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          <span className="font-medium">{t.library.season(season)}</span>
          <span className="text-xs text-muted">{t.library.episodes(have, episodes.length)}</span>
        </button>
        <div className="w-28">
          <ProgressBar value={aired ? have / aired : 0} tone={have >= aired && aired > 0 ? "success" : "accent"} />
        </div>
        <SearchChoice
          what={t.library.season(season)}
          onAuto={() => run(() => sonarr.searchSeason(series.id, season), t.library.searchStarted)}
          onManual={() => onManual({ seriesId: series.id, seasonNumber: season }, `${series.title} · ${t.library.season(season)}`)}
        />
      </div>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {episodes.map((e) => {
            const st = episodeStatus(e);
            const plays = watch?.get(episodeKey(e.seasonNumber, e.episodeNumber)) ?? [];
            return (
              <li key={e.id} className="px-4 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <MonitorToggle
                    monitored={e.monitored}
                    what={e.title}
                    onToggle={() => run(() => sonarr.setEpisodesMonitored([e.id], !e.monitored))}
                  />
                  <EpisodeMark status={st} number={e.episodeNumber} variant={MARK} />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  <span className="w-20 text-xs text-muted">{formatDate(e.airDateUtc)}</span>
                  {watch &&
                    (plays.length ? (
                      <EpisodeViewersButton
                        plays={plays}
                        open={openEp === e.id}
                        onToggle={() => setOpenEp(openEp === e.id ? null : e.id)}
                      />
                    ) : (
                      <span className="w-20" />
                    ))}
                  <SearchChoice
                    what={e.title}
                    onAuto={() => run(() => sonarr.searchEpisodes([e.id]), t.library.searchStarted)}
                    onManual={() =>
                      onManual({ episodeId: e.id }, `${series.title} · ${e.seasonNumber}x${String(e.episodeNumber).padStart(2, "0")}`)
                    }
                  />
                </div>
                {openEp === e.id && plays.length > 0 && (
                  <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2">
                    <PlayList plays={plays} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SeriesDetail({ series, onClose }: { series: Series | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [manual, setManual] = useState<{ query: ReleaseQuery; what: string } | null>(null);
  const episodes = useEpisodes(series?.id);
  const watchQ = useMediaHistory(series ? showRefs(series) : []);
  const watch = useMemo(() => (watchQ.data && !watchQ.data.notFound ? playsByEpisode(watchQ.data.plays) : undefined), [watchQ.data]);
  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>();
    for (const e of episodes.data ?? []) map.set(e.seasonNumber, [...(map.get(e.seasonNumber) ?? []), e]);
    return [...map.entries()]
      .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : b - a))
      .map(([n, eps]) => [n, eps.sort((x, y) => y.episodeNumber - x.episodeNumber)] as const);
  }, [episodes.data]);
  if (!series) return null;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["sonarr"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const st = series.statistics;
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={series.title} wide>
        <div className="flex flex-col gap-6">
          <div className="flex gap-6">
            <Poster src={posterUrl("sonarr", series)} title={series.title} className="w-40 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>{series.year}</span>
                {series.network && <span>{series.network}</span>}
                {st && <span>{t.library.episodes(st.episodeFileCount, st.episodeCount)}</span>}
                {st?.sizeOnDisk ? <span>{formatBytes(st.sizeOnDisk)}</span> : null}
                <span>{series.monitored ? t.library.monitoredLabel : t.library.unmonitoredLabel}</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t.library.seriesType}</span>
                <select
                  className="input w-auto py-1"
                  value={series.seriesType ?? "standard"}
                  onChange={(e) => {
                    const type = e.target.value as SeriesType;
                    run(() => sonarr.setSeriesType(series, type), t.library.typeChanged(series.title, seriesTypeLabel[type]));
                  }}
                >
                  {(Object.keys(seriesTypeLabel) as SeriesType[]).map((v) => (
                    <option key={v} value={v}>
                      {seriesTypeLabel[v]}
                    </option>
                  ))}
                </select>
              </label>
              {series.overview && <p className="line-clamp-5 text-sm leading-relaxed text-muted">{series.overview}</p>}
              <PlexBadge kind="show" ids={{ tvdbId: series.tvdbId, tmdbId: series.tmdbId, imdbId: series.imdbId }} />
              <FaInfo item={seriesItem(series)} />
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => run(() => sonarr.searchSeries(series.id), t.library.searchStarted)}>
                  <Search className="h-4 w-4" /> {t.library.searchNow}
                </button>
                <button className="btn-outline" onClick={() => run(() => sonarr.setMonitored(series, !series.monitored).then(onClose))}>
                  <MonitorIcon monitored={series.monitored} />
                  {series.monitored ? t.library.monitorOff : t.library.monitorOn}
                </button>
                <button className="btn-ghost ml-auto text-danger" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" /> {t.common.delete}
                </button>
              </div>
              <p className="-mt-2 text-xs text-muted">{t.library.seriesManualHint}</p>
            </div>
          </div>
          <SeriesWatchSummary q={watchQ} />
          {episodes.isLoading ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-2">
              {seasons.map(([n, eps]) => (
                <SeasonBlock
                  key={n}
                  series={series}
                  season={n}
                  episodes={eps}
                  run={run}
                  watch={watch}
                  onManual={(query, what) => setManual({ query, what })}
                />
              ))}
            </div>
          )}
        </div>
      </Dialog>
      <ReleaseSearchDialog service="sonarr" query={manual?.query ?? null} what={manual?.what ?? ""} onClose={() => setManual(null)} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.library.deleteSeries}
        message={t.library.deleteMessage(series.title)}
        checkboxLabel={t.common.deleteFiles}
        onConfirm={(deleteFiles) => run(() => sonarr.deleteSeries(series.id, deleteFiles).then(onClose))}
      />
    </>
  );
}
