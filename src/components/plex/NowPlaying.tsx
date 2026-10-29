import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Poster } from "@/components/media/PosterCard";
import { Empty, Loading, ProgressBar } from "@/components/ui";
import { isTranscoding, plex, plexPoster, plexTitle, type PlexSession } from "@/api/plex";
import { usePlexSessions } from "@/hooks/usePlex";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isApiError } from "@/lib/types";

function StopDialog({ session, onClose }: { session: PlexSession | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>(t.plex.stopDefaultReason);
  if (!session) return null;
  const { title } = plexTitle(session);
  async function stop() {
    try {
      await plex.terminate(session!.Session?.id ?? "", reason.trim() || t.plex.stopDefaultReason);
      toast.success(t.plex.stopped);
      await qc.invalidateQueries({ queryKey: ["plex", "sessions"] });
      onClose();
    } catch (e) {
      // Sin Plex Pass el servidor responde 401/403 a esta petición aunque el token sea bueno.
      toast.error(isApiError(e) && (e.kind === "Unauthorized" || e.status === 403) ? t.plex.stopNeedsPass : errorMessage(e, "plex"));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.plex.stopTitle}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t.plex.stopMessage(session.User?.title ?? "?", title)}</p>
        <label className="block">
          <span className="label">{t.plex.stopReason}</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn-danger" onClick={stop}>
            <Square className="h-4 w-4" /> {t.plex.stop}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function SessionRow({ s, onStop }: { s: PlexSession; onStop: () => void }) {
  const { title, subtitle } = plexTitle(s);
  const state = s.Player?.state;
  const progress = s.duration ? (s.viewOffset ?? 0) / s.duration : 0;
  const media = s.Media?.[0];
  const transcoding = isTranscoding(s);
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Poster src={plexPoster(s)} title={title} className="w-12 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium" title={title}>
            {title}
          </span>
          {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1 font-medium text-fg">
            {state === "paused" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {s.User?.title}
          </span>
          <span>{s.Player?.title ?? s.Player?.product}</span>
          {state === "paused" && <span>{t.plex.paused}</span>}
          {state === "buffering" && <span>{t.plex.buffering}</span>}
          <span className={cn("chip", transcoding ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
            {transcoding ? t.plex.transcode : t.plex.direct}
          </span>
          {media?.videoResolution && <span>{/^\d+$/.test(media.videoResolution) ? `${media.videoResolution}p` : media.videoResolution.toUpperCase()}</span>}
          {s.Session?.bandwidth ? <span>{formatSpeed((s.Session.bandwidth * 1000) / 8)}</span> : null}
          {s.Session?.location && <span>{s.Session.location === "lan" ? t.plex.lan : t.plex.wan}</span>}
        </div>
        <ProgressBar value={progress} />
      </div>
      {s.Session?.id && (
        <button className="btn-ghost text-danger" onClick={onStop} aria-label={`${t.plex.stop} ${title}`} title={t.plex.stop}>
          <Square className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Lo que se está viendo ahora en Plex. No ocupa sitio si Plex no está configurado (ni, en Inicio, si nadie ve nada). */
export function NowPlaying({ title, hideWhenEmpty }: { title?: string; hideWhenEmpty?: boolean }) {
  const sessions = usePlexSessions();
  const [stopping, setStopping] = useState<PlexSession | null>(null);
  if (sessions.configured === false) return null;
  const list = sessions.data ?? [];
  if (hideWhenEmpty && !list.length && !sessions.isError) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title ?? t.plex.nowPlaying}</h2>
      {sessions.isLoading ? (
        <Loading />
      ) : sessions.isError ? (
        <ErrorPanel service="plex" error={sessions.error} onRetry={() => sessions.refetch()} compact />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty>{t.plex.nobody}</Empty>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {list.map((s) => (
            <SessionRow key={s.Session?.id ?? s.sessionKey ?? s.ratingKey} s={s} onStop={() => setStopping(s)} />
          ))}
        </div>
      )}
      <StopDialog key={stopping?.Session?.id} session={stopping} onClose={() => setStopping(null)} />
    </section>
  );
}
