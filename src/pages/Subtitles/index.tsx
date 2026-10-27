import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { bazarr, langLabel, type SubLang } from "@/api/bazarr";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { errorMessage } from "@/lib/errors";

type Tab = "movies" | "episodes";

interface Row {
  key: string;
  title: string;
  subtitle?: string;
  langs: SubLang[];
  search: () => Promise<void>;
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
            {r.langs.map((l) => <span key={l.code2 + !!l.forced + !!l.hi} className="chip bg-danger/10 text-danger">{langLabel(l)}</span>)}
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
        </div>
      ))}
    </div>
  );
}

export default function SubtitlesPage() {
  const [tab, setTab] = useState<Tab>("movies");
  const movies = useServiceQuery("bazarr", ["wanted-movies"], bazarr.getWantedMovies, { refetchInterval: REFRESH.library });
  const episodes = useServiceQuery("bazarr", ["wanted-episodes"], bazarr.getWantedEpisodes, { refetchInterval: REFRESH.library });
  const current = tab === "movies" ? movies : episodes;

  if (movies.configured === false) return <Page title={t.nav.subtitles}><NotConfigured service="bazarr" /></Page>;

  const rows: Row[] =
    tab === "movies"
      ? (movies.data ?? []).map((m) => ({ key: `m${m.radarrId}`, title: m.title, langs: m.missing_subtitles, search: () => bazarr.searchMovie(m) }))
      : (episodes.data ?? []).map((e) => ({
          key: `e${e.sonarrEpisodeId}`,
          title: e.seriesTitle,
          subtitle: `${e.episode_number} · ${e.episodeTitle}`,
          langs: e.missing_subtitles,
          search: () => bazarr.searchEpisode(e),
        }));

  return (
    <Page
      title={t.nav.subtitles}
      actions={
        <>
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
      {current.isLoading || current.configured === undefined ? <Loading /> : current.isError ? <ErrorPanel service="bazarr" error={current.error} onRetry={() => current.refetch()} /> : <WantedList rows={rows} />}
    </Page>
  );
}
