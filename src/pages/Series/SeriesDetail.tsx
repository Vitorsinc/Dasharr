import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileX, FolderSearch, Pencil, RefreshCw, Search, TextCursorInput, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ArrRatings } from "@/components/media/ArrRatings";
import { FaInfo } from "@/components/media/FilmAffinity";
import { Poster } from "@/components/media/PosterCard";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { SearchChoice } from "@/components/media/SearchChoice";
import { EpisodeMark } from "@/components/media/EpisodeMark";
import { MonitorIcon, MonitorToggle } from "@/components/media/MonitorToggle";

import { Loading, ProgressBar } from "@/components/ui";
import { posterUrl, type ReleaseQuery } from "@/api/arr";
import { PlexBadge } from "@/components/plex/PlexBadge";
import { seriesItem } from "@/api/filmaffinity";
import { episodeStatus, sonarr, type Episode, type EpisodeFile, type MonitorChange, type Series, type SeriesType } from "@/api/sonarr";
import { ArrHistory } from "@/components/media/ArrHistory";
import { EditMediaDialog } from "@/components/media/EditMediaDialog";
import { RenameDialog } from "./RenameDialog";
import { useEpisodeFiles, useEpisodes, useSonarrMeta } from "@/hooks/useArr";
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
  files,
  onDeleteFile,
}: {
  series: Series;
  season: number;
  episodes: Episode[];
  files: Map<number, EpisodeFile>;
  onDeleteFile: (file: EpisodeFile, what: string) => void;
  /** Reproducciones de Tracearr por episodio (`"1x3"`); undefined sin Tracearr. */
  watch?: Map<string, Play[]>;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
  onManual: (q: ReleaseQuery, what: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openEp, setOpenEp] = useState<number | null>(null);
  const have = episodes.filter((e) => e.hasFile).length;
  const aired = episodes.filter((e) => episodeStatus(e) !== "unaired").length;
  const seasonMonitored = series.seasons?.find((x) => x.seasonNumber === season)?.monitored ?? episodes.some((e) => e.monitored);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <MonitorToggle
          monitored={seasonMonitored}
          what={t.library.season(season)}
          onToggle={() => run(() => sonarr.setSeasonMonitored(series, season, !seasonMonitored))}
        />
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
            const file = e.episodeFileId ? files.get(e.episodeFileId) : undefined;
            const code = `${e.seasonNumber}x${String(e.episodeNumber).padStart(2, "0")}`;
            return (
              <li key={e.id} className="px-4 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <MonitorToggle
                    monitored={e.monitored}
                    what={e.title}
                    onToggle={() => run(() => sonarr.setEpisodesMonitored([e.id], !e.monitored))}
                  />
                  <EpisodeMark status={st} number={e.episodeNumber} />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {file && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted" title={file.relativePath}>
                      {file.quality?.quality?.name} · {formatBytes(file.size)}
                      <button
                        className="btn-ghost p-1 text-muted hover:text-danger"
                        title={t.seriesTools.deleteFile}
                        aria-label={`${t.seriesTools.deleteFile}: ${code}`}
                        onClick={() => onDeleteFile(file, `${series.title} ${code}`)}
                      >
                        <FileX className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
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
                    onManual={() => onManual({ episodeId: e.id }, `${series.title} · ${code}`)}
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
  const episodeFiles = useEpisodeFiles(series?.id);
  const files = useMemo(
    () => new Map((Array.isArray(episodeFiles.data) ? episodeFiles.data : []).map((f) => [f.id, f])),
    [episodeFiles.data],
  );
  const meta = useSonarrMeta();
  const [editing, setEditing] = useState(false);
  const [monitorChange, setMonitorChange] = useState<MonitorChange | "">("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState<{ file: EpisodeFile; what: string } | null>(null);
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
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <FaInfo item={seriesItem(series)} />
                <ArrRatings ratings={{ tvdb: series.ratings }} />
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => run(() => sonarr.searchSeries(series.id), t.library.searchStarted)}>
                  <Search className="h-4 w-4" /> {t.library.searchNow}
                </button>
                <button className="btn-outline" onClick={() => run(() => sonarr.setMonitored(series, !series.monitored).then(onClose))}>
                  <MonitorIcon monitored={series.monitored} />
                  {series.monitored ? t.library.monitorOff : t.library.monitorOn}
                </button>
                <button
                  className="btn-outline"
                  onClick={() => {
                    setMonitorChange("");
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" /> {t.editMedia.edit}
                </button>
                <button className="btn-ghost ml-auto text-danger" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" /> {t.common.delete}
                </button>
              </div>
              <p className="-mt-2 text-xs text-muted">{t.library.seriesManualHint}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  title={t.seriesTools.refreshHint}
                  onClick={() => run(() => sonarr.refreshSeries(series.id), t.seriesTools.refreshStarted)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t.seriesTools.refresh}
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  title={t.seriesTools.rescanHint}
                  onClick={() => run(() => sonarr.rescanSeries(series.id), t.seriesTools.rescanStarted)}
                >
                  <FolderSearch className="h-3.5 w-3.5" /> {t.seriesTools.rescan}
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" title={t.seriesTools.renameHint} onClick={() => setRenaming(true)}>
                  <TextCursorInput className="h-3.5 w-3.5" /> {t.seriesTools.rename}
                </button>
              </div>
            </div>
          </div>
          <SeriesWatchSummary q={watchQ} />
          <ArrHistory service="sonarr" id={series.id} load={() => sonarr.getHistory(series.id)} />
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
                  files={files}
                  onDeleteFile={(file, what) => setDeleting({ file, what })}
                  onManual={(query, what) => setManual({ query, what })}
                />
              ))}
            </div>
          )}
        </div>
      </Dialog>
      <ReleaseSearchDialog service="sonarr" query={manual?.query ?? null} what={manual?.what ?? ""} onClose={() => setManual(null)} />
      {editing && (
        <EditMediaDialog
          title={t.editMedia.titleSeries(series.title)}
          profiles={meta.profiles.data ?? []}
          rootFolders={meta.roots.data ?? []}
          initial={series}
          extra={
            <label>
              <span className="label">{t.editMedia.monitorChange}</span>
              <select className="input" value={monitorChange} onChange={(e) => setMonitorChange(e.target.value as MonitorChange | "")}>
                <option value="">{t.editMedia.monitorKeep}</option>
                {Object.entries(t.editMedia.monitorOptions).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          }
          onSave={async (v) => {
            await sonarr.updateSeries(series, { ...v, monitor: monitorChange || undefined });
            await qc.invalidateQueries({ queryKey: ["sonarr"] });
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {renaming && <RenameDialog series={series} onClose={() => setRenaming(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.seriesTools.deleteFileTitle}
        message={deleting ? t.seriesTools.deleteFileMessage(deleting.what) : ""}
        onConfirm={() => deleting && run(() => sonarr.deleteEpisodeFile(deleting.file.id), t.seriesTools.fileDeleted)}
      />
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
