import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, User } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { bazarr, HISTORY_ACTIONS, langLabel, type ManualSubTarget, type SubHistoryRecord, type SubLang } from "@/api/bazarr";
import { ManualSubtitleDialog } from "./ManualSubtitleDialog";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";

type Tab = "movies" | "episodes";
type View = "wanted" | "history";

interface Row {
  key: string;
  title: string;
  subtitle?: string;
  langs: SubLang[];
  search: () => Promise<void>;
  manual: () => void;
}

const actionTone: Record<string, string> = {
  deleted: "text-warning",
  downloaded: "text-success",
  manual: "text-success",
  upgraded: "text-accent",
};

function HistoryList({ kind }: { kind: Tab }) {
  const q = useServiceQuery("bazarr", ["history", kind], () => bazarr.getHistory(kind), { refetchInterval: REFRESH.queue });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="bazarr" error={q.error} onRetry={() => q.refetch()} />;
  const list: SubHistoryRecord[] = q.data ?? [];
  if (!list.length) return <Empty>{t.subtitles.historyEmpty}</Empty>;
  return (
    <div className="card divide-y divide-border">
      {list.map((h, i) => {
        const action = HISTORY_ACTIONS[h.action] ?? "";
        const title = kind === "movies" ? h.title : `${h.seriesTitle ?? ""} · ${h.episode_number ?? ""}`;
        return (
          <div key={i} className="flex items-center gap-4 px-4 py-2.5 text-sm">
            <span className={cn("w-32 shrink-0 font-medium", actionTone[action])}>{t.subtitles.actions[action] ?? action}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{title}</div>
              {h.description && (
                <div className="truncate text-xs text-muted" title={h.description}>
                  {h.description}
                </div>
              )}
            </div>
            {h.language && <span className="chip bg-surface-2 text-muted">{langLabel(h.language)}</span>}
            <span className="w-32 shrink-0 text-right text-xs text-muted">{h.parsed_timestamp ?? h.timestamp}</span>
          </div>
        );
      })}
    </div>
  );
}

function WantedList({ rows }: { rows: Row[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) return <Empty>{t.subtitles.none}</Empty>;
  return (
    <div className="card divide-y divide-border">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.title}</div>
            {r.subtitle && <div className="truncate text-xs text-muted">{r.subtitle}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {r.langs.map((l) => (
              <span key={l.code2 + !!l.forced + !!l.hi} className="chip bg-danger/10 text-danger">
                {langLabel(l)}
              </span>
            ))}
          </div>
          <button
            className="btn-outline px-2.5 py-1.5"
            disabled={busy === r.key}
            aria-label={`${t.subtitles.search}: ${r.title}${r.subtitle ? ` ${r.subtitle}` : ""}`}
            onClick={async () => {
              setBusy(r.key);
              try {
                await r.search();
                toast.success(t.subtitles.searchStarted(r.title));
                await qc.invalidateQueries({ queryKey: ["bazarr"] });
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === r.key ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {t.subtitles.search}
          </button>
          <button
            className="btn-outline px-2.5 py-1.5 text-accent"
            title={t.subtitles.manualHint}
            aria-label={`${t.subtitles.manual}: ${r.title}${r.subtitle ? ` ${r.subtitle}` : ""}`}
            onClick={r.manual}
          >
            <User className="h-4 w-4" /> {t.subtitles.manual}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SubtitlesPage() {
  const [tab, setTab] = useState<Tab>("movies");
  const [view, setView] = useState<View>("wanted");
  const [manual, setManual] = useState<{ target: ManualSubTarget; what: string } | null>(null);
  const movies = useServiceQuery("bazarr", ["wanted-movies"], bazarr.getWantedMovies, { refetchInterval: REFRESH.library });
  const episodes = useServiceQuery("bazarr", ["wanted-episodes"], bazarr.getWantedEpisodes, { refetchInterval: REFRESH.library });
  const current = tab === "movies" ? movies : episodes;

  if (movies.configured === false)
    return (
      <Page title={t.nav.subtitles}>
        <NotConfigured service="bazarr" />
      </Page>
    );

  const rows: Row[] =
    tab === "movies"
      ? (movies.data ?? []).map((m) => ({
          key: `m${m.radarrId}`,
          title: m.title,
          langs: m.missing_subtitles,
          search: () => bazarr.searchMovie(m),
          manual: () => setManual({ target: { kind: "movie", radarrId: m.radarrId }, what: m.title }),
        }))
      : (episodes.data ?? []).map((e) => ({
          key: `e${e.sonarrEpisodeId}`,
          title: e.seriesTitle,
          subtitle: `${e.episode_number} · ${e.episodeTitle}`,
          langs: e.missing_subtitles,
          search: () => bazarr.searchEpisode(e),
          manual: () =>
            setManual({
              target: { kind: "episode", seriesId: e.sonarrSeriesId, episodeId: e.sonarrEpisodeId },
              what: `${e.seriesTitle} · ${e.episode_number}`,
            }),
        }));

  return (
    <Page
      title={t.nav.subtitles}
      actions={
        <>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "wanted", label: t.subtitles.missing },
              { value: "history", label: t.subtitles.history },
            ]}
          />
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "movies", label: `${t.subtitles.movies}${movies.data ? ` (${movies.data.length})` : ""}` },
              { value: "episodes", label: `${t.subtitles.episodes}${episodes.data ? ` (${episodes.data.length})` : ""}` },
            ]}
          />
          <button
            className="btn-primary"
            onClick={() =>
              bazarr.searchAllWanted().then(
                () => toast.success(t.subtitles.searchAllStarted),
                (e) => toast.error(errorMessage(e)),
              )
            }
          >
            <Search className="h-4 w-4" /> {t.subtitles.searchAll}
          </button>
        </>
      }
    >
      {view === "history" ? (
        <HistoryList kind={tab} />
      ) : current.isLoading || current.configured === undefined ? (
        <Loading />
      ) : current.isError ? (
        <ErrorPanel service="bazarr" error={current.error} onRetry={() => current.refetch()} />
      ) : (
        <WantedList rows={rows} />
      )}
      <ManualSubtitleDialog target={manual?.target ?? null} what={manual?.what ?? ""} onClose={() => setManual(null)} />
    </Page>
  );
}
