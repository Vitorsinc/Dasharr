import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play as PlayIcon, RefreshCw } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, ProgressBar, Segmented, Spinner, Toggle } from "@/components/ui";
import { PlayProgress, UserAvatar } from "@/components/watch/WatchHistory";
import { playUserName, tracearr, userLabel, type HistoryFilter, type Play, type Stream } from "@/api/tracearr";
import { useStreams, useTracearrUsers } from "@/hooks/useTracearr";
import { useIsConfigured } from "@/hooks/useSettings";
import { t } from "@/i18n/es";
import { imageUrl } from "@/lib/tauri";
import { formatDateTime } from "@/lib/format";
import { NowWatching } from "@/components/NowWatching";

type Kind = "all" | "movie" | "episode";

const pad = (n: number | null) => String(n ?? 0).padStart(2, "0");

/** Título principal y secundario: la serie y "1x03 · Título del episodio", o la película y su año. */
export function playTitles(p: Pick<Play, "media_type" | "media_title" | "show_title" | "season_number" | "episode_number" | "year">) {
  if (p.media_type === "episode" && p.show_title)
    return { title: p.show_title, subtitle: `${p.season_number ?? "?"}x${pad(p.episode_number)} · ${p.media_title}` };
  return { title: p.media_title, subtitle: p.year ? String(p.year) : "" };
}

export function formatMinutes(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

function Thumb({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={imageUrl("tracearr", url)}
      alt={title}
      loading="lazy"
      className="h-14 w-10 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="h-14 w-10 shrink-0 rounded bg-surface-2" />
  );
}

/** Lo que se ve ahora según Tracearr. Solo se usa si Plex no está configurado: ver `NowWatching`. */
export function TracearrNowPlaying() {
  const streams = useStreams();
  const list = streams.data ?? [];
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={t.history.nowPlaying}>
      <h2 className="text-lg font-semibold">{t.history.nowPlaying}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => (
          <StreamCard key={s.id} s={s} />
        ))}
      </div>
    </section>
  );
}

function StreamCard({ s }: { s: Stream }) {
  const { title, subtitle } = playTitles(s);
  const paused = s.state === "paused";
  return (
    <div className="card flex gap-3 p-3">
      <Thumb url={s.poster_url} title={title} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
        <div className="flex items-center gap-2 text-xs text-muted">
          {paused ? <Pause className="h-3.5 w-3.5" aria-label={t.history.paused} /> : <PlayIcon className="h-3.5 w-3.5 text-success" />}
          <span className="font-medium text-fg">{s.username}</span>
          <span className="truncate">
            {[s.player ?? s.device, s.is_transcode ? t.history.transcode : t.history.direct].filter(Boolean).join(" · ")}
          </span>
        </div>
        <ProgressBar value={s.duration_ms ? s.progress_ms / s.duration_ms : 0} />
      </div>
    </div>
  );
}

function PlayRow({ p }: { p: Play }) {
  const { title, subtitle } = playTitles(p);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Thumb url={p.poster_url} title={title} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      <div className="flex w-40 items-center gap-2 text-sm">
        <UserAvatar user={p.user} />
        <span className="truncate">{playUserName(p.user)}</span>
      </div>
      <span className="w-28 text-xs text-muted">{formatDateTime(p.started_at)}</span>
      <span className="w-20 text-xs tabular-nums text-muted">{formatMinutes(p.duration_ms)}</span>
      <span className="w-14">
        <PlayProgress play={p} />
      </span>
      <span className="hidden w-48 truncate text-xs text-muted lg:block">
        {[p.player ?? p.device, p.platform, p.is_transcode ? t.history.transcode : t.history.direct].filter(Boolean).join(" · ")}
      </span>
    </li>
  );
}

export default function HistoryPage() {
  const qc = useQueryClient();
  const configured = useIsConfigured("tracearr");
  const users = useTracearrUsers();
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [onlyWatched, setOnlyWatched] = useState(false);
  const filter: HistoryFilter = {
    userId: userId || undefined,
    mediaType: kind === "all" ? undefined : kind,
    watched: onlyWatched || undefined,
  };
  const history = useInfiniteQuery({
    queryKey: ["tracearr", "history", filter],
    queryFn: ({ pageParam }) => tracearr.history(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled: configured === true,
  });

  if (configured === false)
    return (
      <Page title={t.nav.history}>
        <NotConfigured service="tracearr" />
      </Page>
    );

  const plays = history.data?.pages.flatMap((p) => p.data ?? []) ?? [];
  return (
    <Page
      title={t.nav.history}
      actions={
        <button className="btn-outline" onClick={() => qc.invalidateQueries({ queryKey: ["tracearr"] })}>
          <RefreshCw className="h-4 w-4" /> {t.history.refresh}
        </button>
      }
    >
      <p className="-mt-4 text-sm text-muted">{t.history.hint}</p>
      <NowWatching title={t.history.nowPlaying} hideWhenEmpty />
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={t.history.user}>
          <option value="">{t.history.allUsers}</option>
          {(users.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {userLabel(u)}
            </option>
          ))}
        </select>
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: t.history.all },
            { value: "movie", label: t.history.movies },
            { value: "episode", label: t.history.episodes },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <Toggle checked={onlyWatched} onChange={setOnlyWatched} label={t.history.onlyWatched} />
          {t.history.onlyWatched}
        </label>
      </div>
      {history.isLoading || configured === undefined ? (
        <Loading />
      ) : history.isError ? (
        <ErrorPanel service="tracearr" error={history.error} onRetry={() => history.refetch()} />
      ) : !plays.length ? (
        <Empty>{t.history.empty}</Empty>
      ) : (
        <>
          <ul className="card divide-y divide-border" aria-label={t.nav.history}>
            {plays.map((p) => (
              <PlayRow key={p.id} p={p} />
            ))}
          </ul>
          {history.hasNextPage && (
            <button className="btn-outline self-center" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
              {history.isFetchingNextPage && <Spinner className="h-4 w-4" />}
              {t.history.loadMore}
            </button>
          )}
        </>
      )}
    </Page>
  );
}
