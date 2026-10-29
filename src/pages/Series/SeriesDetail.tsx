import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Eye, EyeOff, ListFilter, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { FaInfo } from "@/components/media/FilmAffinity";
import { Poster } from "@/components/media/PosterCard";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { Loading, ProgressBar } from "@/components/ui";
import { posterUrl, type ReleaseQuery } from "@/api/arr";
import { seriesItem } from "@/api/filmaffinity";
import { episodeStatus, sonarr, type Episode, type EpisodeStatus, type Series } from "@/api/sonarr";
import { useEpisodes } from "@/hooks/useArr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const epStyle: Record<EpisodeStatus, { cls: string; label: string }> = {
  downloaded: { cls: "bg-success/15 text-success", label: t.library.epDownloaded },
  missing: { cls: "bg-danger/15 text-danger", label: t.library.epMissing },
  unaired: { cls: "bg-surface-2 text-muted", label: t.library.epUnaired },
};

function SeasonBlock({
  series,
  season,
  episodes,
  run,
  onManual,
}: {
  series: Series;
  season: number;
  episodes: Episode[];
  run: (fn: () => Promise<unknown>, ok?: string) => void;
  onManual: (q: ReleaseQuery, what: string) => void;
}) {
  const [open, setOpen] = useState(false);
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
        <button
          className="btn-ghost p-1.5"
          title={t.library.searchSeason}
          aria-label={`${t.library.searchSeason} ${season}`}
          onClick={() => run(() => sonarr.searchSeason(series.id, season), t.library.searchStarted)}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost p-1.5"
          title={t.releases.manual}
          aria-label={`${t.releases.manual} ${t.library.season(season)}`}
          onClick={() => onManual({ seriesId: series.id, seasonNumber: season }, `${series.title} · ${t.library.season(season)}`)}
        >
          <ListFilter className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {episodes.map((e) => {
            const st = episodeStatus(e);
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-8 tabular-nums text-muted">{e.episodeNumber}</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="w-20 text-xs text-muted">{formatDate(e.airDateUtc)}</span>
                <span className={cn("chip w-24 justify-center", epStyle[st].cls)}>{epStyle[st].label}</span>
                <button
                  className="btn-ghost p-1"
                  title={e.monitored ? t.library.monitorOff : t.library.monitorOn}
                  aria-label={`${e.monitored ? t.library.monitorOff : t.library.monitorOn} ${e.title}`}
                  onClick={() => run(() => sonarr.setEpisodesMonitored([e.id], !e.monitored))}
                >
                  {e.monitored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted" />}
                </button>
                <button
                  className="btn-ghost p-1"
                  title={t.library.searchEpisode}
                  aria-label={`${t.library.searchEpisode} ${e.title}`}
                  onClick={() => run(() => sonarr.searchEpisodes([e.id]), t.library.searchStarted)}
                >
                  <Search className="h-4 w-4" />
                </button>
                <button
                  className="btn-ghost p-1"
                  title={t.releases.manual}
                  aria-label={`${t.releases.manual} ${e.title}`}
                  onClick={() =>
                    onManual({ episodeId: e.id }, `${series.title} · ${e.seasonNumber}x${String(e.episodeNumber).padStart(2, "0")}`)
                  }
                >
                  <ListFilter className="h-4 w-4" />
                </button>
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
  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>();
    for (const e of episodes.data ?? []) map.set(e.seasonNumber, [...(map.get(e.seasonNumber) ?? []), e]);
    return [...map.entries()]
      .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : b - a))
      .map(([n, eps]) => [n, eps.sort((x, y) => x.episodeNumber - y.episodeNumber)] as const);
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
              {series.overview && <p className="line-clamp-5 text-sm leading-relaxed text-muted">{series.overview}</p>}
              <FaInfo item={seriesItem(series)} />
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => run(() => sonarr.searchSeries(series.id), t.library.searchStarted)}>
                  <Search className="h-4 w-4" /> {t.library.searchNow}
                </button>
                <button className="btn-outline" onClick={() => run(() => sonarr.setMonitored(series, !series.monitored).then(onClose))}>
                  {series.monitored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {series.monitored ? t.library.monitorOff : t.library.monitorOn}
                </button>
                <button className="btn-ghost ml-auto text-danger" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" /> {t.common.delete}
                </button>
              </div>
            </div>
          </div>
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
