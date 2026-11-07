import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Loading, Spinner, Toggle } from "@/components/ui";
import {
  MediaStatus,
  requestableSeasons,
  RequestStatus,
  seerr,
  titleOf,
  tmdbImage,
  userName,
  yearOf,
  type MediaType,
  type MovieDetails,
  type TvDetails,
} from "@/api/seerr";
import { useSeerrMe, useSeerrMedia, useSeerrRun, useSeerrServerDetails, useSeerrServers, useSeerrUsers } from "@/hooks/useSeerr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { MediaStatusChip } from "./RequestRow";

export interface RequestTarget {
  type: MediaType;
  tmdbId: number;
  title: string;
}

/** Diálogo para pedir una película o temporadas de una serie, con 4K, servidor, perfil, carpeta y usuario. */
export function RequestDialog({ target, onClose }: { target: RequestTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()} title={target ? t.seerr.requestTitle(target.title) : ""} wide>
      {target && <RequestForm key={`${target.type}-${target.tmdbId}`} target={target} onDone={onClose} />}
    </Dialog>
  );
}

function RequestForm({ target, onDone }: { target: RequestTarget; onDone: () => void }) {
  const details = useSeerrMedia(target.type, target.tmdbId);
  if (details.isLoading) return <Loading />;
  if (details.isError || !details.data) return <ErrorPanel service="seerr" error={details.error} onRetry={() => details.refetch()} compact />;
  return <Form target={target} details={details.data} onDone={onDone} />;
}

function Form({ target, details, onDone }: { target: RequestTarget; details: MovieDetails | TvDetails; onDone: () => void }) {
  const run = useSeerrRun();
  const isTv = target.type === "tv";
  const tv = isTv ? (details as TvDetails) : null;
  const servers = useSeerrServers(target.type);
  const has4k = (servers.data ?? []).some((s) => s.is4k);
  const [is4k, setIs4k] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Servidor, perfil y carpeta: por defecto los de Seerr; solo se envían si se cambian.
  const candidates = (servers.data ?? []).filter((s) => s.is4k === is4k);
  const defaultServer = candidates.find((s) => s.isDefault) ?? candidates[0];
  const [serverId, setServerId] = useState<number | undefined>();
  const server = candidates.find((s) => s.id === serverId) ?? defaultServer;
  const serverDetails = useSeerrServerDetails(target.type, showAdvanced ? server?.id : undefined);
  const [profileId, setProfileId] = useState<number | undefined>();
  const [rootFolder, setRootFolder] = useState<string | undefined>();
  useEffect(() => {
    setServerId(undefined);
    setProfileId(undefined);
    setRootFolder(undefined);
  }, [is4k]);

  const me = useSeerrMe();
  const users = useSeerrUsers();
  const [userId, setUserId] = useState<number | undefined>();

  const seasons = useMemo(() => (tv ? requestableSeasons(tv, is4k) : []), [tv, is4k]);
  const free = seasons.filter((s) => s.state === "free").map((s) => s.season.seasonNumber);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => setPicked(new Set(free)), [free.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const media = details.mediaInfo;
  const status = is4k ? media?.status4k : media?.status;
  const movieTaken =
    !isTv &&
    (status === MediaStatus.Available ||
      status === MediaStatus.Processing ||
      status === MediaStatus.Pending ||
      (media?.requests ?? []).some((r) => r.is4k === is4k && r.status === RequestStatus.Pending));
  const tvTaken = isTv && free.length === 0;
  const blocked = movieTaken || tvTaken;
  const nothingPicked = isTv && picked.size === 0;

  async function submit() {
    setBusy(true);
    const changed = showAdvanced && server;
    const ok = await run(
      () =>
        seerr.create({
          mediaType: target.type,
          mediaId: target.tmdbId,
          tvdbId: tv?.externalIds?.tvdbId ?? undefined,
          seasons: isTv ? (picked.size === free.length && free.length === seasons.length ? "all" : [...picked].sort((a, b) => a - b)) : undefined,
          is4k,
          serverId: changed ? server.id : undefined,
          profileId: changed ? (profileId ?? server.activeProfileId) : undefined,
          rootFolder: changed ? (rootFolder ?? server.activeDirectory) : undefined,
          userId: userId !== undefined && userId !== me.data?.id ? userId : undefined,
        }),
      t.seerr.requested(target.title),
    );
    setBusy(false);
    if (ok) onDone();
  }

  const poster = tmdbImage(details.posterPath, "w342");
  const title = titleOf(details as { title?: string; name?: string });
  const year = yearOf(details as { releaseDate?: string; firstAirDate?: string });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-4">
        <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {poster && <img src={poster} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xl">{title}</h2>
            {year && <span className="text-sm tabular-nums text-muted">{year}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MediaStatusChip status={status} />
          </div>
          {details.overview && <p className="mt-2 line-clamp-4 text-sm text-muted">{details.overview}</p>}
        </div>
      </div>

      {tv && (
        <fieldset className="flex flex-col gap-1">
          <legend className="label">{t.seerr.seasonsLabel}</legend>
          <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              disabled={free.length === 0}
              checked={free.length > 0 && picked.size === free.length}
              ref={(el) => {
                if (el) el.indeterminate = picked.size > 0 && picked.size < free.length;
              }}
              onChange={(e) => setPicked(new Set(e.target.checked ? free : []))}
            />
            {t.seerr.allSeasons}
          </label>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {seasons.map(({ season, state }) => (
              <label
                key={season.seasonNumber}
                className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm", state === "free" ? "hover:bg-surface-2" : "text-muted")}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  disabled={state !== "free"}
                  checked={state !== "free" || picked.has(season.seasonNumber)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (e.target.checked) n.add(season.seasonNumber);
                      else n.delete(season.seasonNumber);
                      return n;
                    })
                  }
                />
                <span className="flex-1">{t.seerr.seasonLabel(season.seasonNumber, season.episodeCount)}</span>
                {state !== "free" && (
                  <span className={cn("chip", state === "requested" ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
                    {t.seerr.seasonState[state]}
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {has4k && (
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>{t.seerr.is4k}</span>
          <Toggle checked={is4k} onChange={setIs4k} label={t.seerr.is4k} />
        </label>
      )}

      <div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted hover:text-fg"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} aria-hidden />
          {t.seerr.advanced}
        </button>
        {showAdvanced && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {candidates.length > 1 && (
              <label className="block">
                <span className="label">{t.seerr.server}</span>
                <select
                  className="input"
                  value={server?.id ?? ""}
                  onChange={(e) => {
                    setServerId(Number(e.target.value));
                    setProfileId(undefined);
                    setRootFolder(undefined);
                  }}
                >
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.isDefault ? t.seerr.defaultOption(s.name) : s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="label">{t.seerr.profile}</span>
              <select
                className="input"
                value={profileId ?? server?.activeProfileId ?? ""}
                onChange={(e) => setProfileId(Number(e.target.value))}
                disabled={!serverDetails.data}
              >
                {(serverDetails.data?.profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === server?.activeProfileId ? t.seerr.defaultOption(p.name) : p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t.seerr.rootFolder}</span>
              <select
                className="input"
                value={rootFolder ?? server?.activeDirectory ?? ""}
                onChange={(e) => setRootFolder(e.target.value)}
                disabled={!serverDetails.data}
              >
                {(serverDetails.data?.rootFolders ?? []).map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path === server?.activeDirectory ? t.seerr.defaultOption(f.path) : f.path}
                  </option>
                ))}
              </select>
            </label>
            {(users.data?.results.length ?? 0) > 1 && (
              <label className="block">
                <span className="label">{t.seerr.asUser}</span>
                <select className="input" value={userId ?? me.data?.id ?? ""} onChange={(e) => setUserId(Number(e.target.value))}>
                  {(users.data?.results ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === me.data?.id ? `${userName(u)} (${t.seerr.me})` : userName(u)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {blocked && (
          <span className="mr-auto text-sm text-muted">
            {status === MediaStatus.Available ? t.seerr.alreadyAvailable : t.seerr.alreadyRequested}
          </span>
        )}
        {!blocked && nothingPicked && <span className="mr-auto text-sm text-muted">{t.seerr.pickSeason}</span>}
        <button className="btn-ghost" onClick={onDone}>
          {t.common.cancel}
        </button>
        <button className="btn-primary" disabled={busy || blocked || nothingPicked} onClick={submit}>
          {busy ? <Spinner className="h-4 w-4 text-accent-fg" /> : <Send className="h-4 w-4" aria-hidden />}
          {t.seerr.request}
        </button>
      </div>
    </div>
  );
}
