import { useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { playUserName, viewers, type MediaHistory, type Play, type PlayUser } from "@/api/tracearr";
import { useMediaHistory } from "@/hooks/useTracearr";
import { t } from "@/i18n/es";
import { imageUrl } from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { usePlexAvatar } from "@/hooks/usePlexAvatars";

/** Avatar de un usuario de Tracearr: primero el de Plex (si lo tiene), después el que guarda Tracearr. */
export function UserAvatar({ user, className }: { user: { username: string | null; avatar_url?: string | null }; className?: string }) {
  const plex = usePlexAvatar(user.username);
  return (
    <Avatar
      name={user.username}
      sources={[plex, user.avatar_url ? imageUrl("tracearr", user.avatar_url) : null]}
      className={className}
    />
  );
}

/** "Vista" si Tracearr la cuenta como vista; si no, el porcentaje al que llegó. */
export function PlayProgress({ play }: { play: Pick<Play, "watched" | "percent_complete"> }) {
  return play.watched ? (
    <span className="chip bg-success/15 text-success">{t.watch.watched}</span>
  ) : (
    <span className="chip bg-surface-2 text-muted">{t.watch.percent(Math.round(play.percent_complete ?? 0))}</span>
  );
}

const deviceLabel = (p: Play) => [p.player ?? p.device, p.product].filter(Boolean).join(" · ");

/** Lista de reproducciones: quién, cuándo, hasta dónde y en qué dispositivo. */
export function PlayList({ plays }: { plays: Play[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {plays.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm">
          <UserAvatar user={p.user} />
          <span className="min-w-0 truncate font-medium">{playUserName(p.user)}</span>
          <span className="text-xs text-muted">{formatDateTime(p.started_at)}</span>
          <PlayProgress play={p} />
          <span className="ml-auto truncate text-xs text-muted">{deviceLabel(p)}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <section className="flex flex-col gap-2" aria-label={t.watch.title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="h-4 w-4 text-muted" aria-hidden /> {t.watch.title}
        {count ? <span className="text-xs font-normal text-muted">{t.watch.viewers(count)}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/** Estado común: oculto sin Tracearr, cargando, error o "no está en Tracearr". Devuelve null si hay datos. */
function watchState(q: ReturnType<typeof useMediaHistory>) {
  if (q.configured !== true) return { hidden: true as const };
  if (q.isLoading) return { node: <Spinner className="h-4 w-4" /> };
  if (q.isError) return { node: <p className="text-xs text-danger">{errorMessage(q.error, "tracearr")}</p> };
  if (q.data?.notFound) return { node: <p className="text-xs text-muted">{t.watch.notInTracearr}</p> };
  return { data: q.data as MediaHistory };
}

const SHOWN = 8;

export function MovieWatchHistory({ refs }: { refs: string[] }) {
  const q = useMediaHistory(refs);
  const [all, setAll] = useState(false);
  const s = watchState(q);
  if ("hidden" in s) return null;
  if (!s.data) return <Section>{s.node}</Section>;
  const vs = viewers(s.data.plays);
  if (!vs.length)
    return (
      <Section>
        <p className="text-xs text-muted">{t.watch.nobodyMovie}</p>
      </Section>
    );
  const shown = all ? vs : vs.slice(0, SHOWN);
  return (
    <Section count={vs.length}>
      <ul className="flex flex-col gap-1.5">
        {shown.map((v) => (
          <li key={v.user.id ?? v.user.server_user_id} className="flex items-center gap-2 text-sm">
            <UserAvatar user={v.user} />
            <span className="min-w-0 truncate font-medium">{playUserName(v.user)}</span>
            <PlayProgress play={{ watched: v.watched, percent_complete: v.maxPercent }} />
            <span className="text-xs text-muted" title={v.plays.map((p) => formatDateTime(p.started_at)).join("\n")}>
              {formatDateTime(v.last)}
              {v.plays.length > 1 && ` · ${t.watch.plays(v.plays.length)}`}
            </span>
          </li>
        ))}
      </ul>
      {!all && vs.length > SHOWN && (
        <button className="self-start text-xs text-accent hover:underline" onClick={() => setAll(true)}>
          {t.watch.showMore(vs.length - SHOWN)}
        </button>
      )}
      {s.data.truncated && <p className="text-xs text-muted">{t.watch.truncated}</p>}
    </Section>
  );
}

/** Resumen de una serie: quién la ve, cuántos episodios ha terminado y cuándo la vio por última vez. */
export function SeriesWatchSummary({ q }: { q: ReturnType<typeof useMediaHistory> }) {
  const s = watchState(q);
  if ("hidden" in s) return null;
  if (!s.data) return <Section>{s.node}</Section>;
  const episodes = s.data.plays.filter((p) => p.media_type === "episode");
  const vs = viewers(episodes);
  if (!vs.length)
    return (
      <Section>
        <p className="text-xs text-muted">{t.watch.nobodySeries}</p>
      </Section>
    );
  return (
    <Section count={vs.length}>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {vs.map((v) => {
          const seen = new Set(v.plays.filter((p) => p.watched).map((p) => `${p.season_number}x${p.episode_number}`)).size;
          return (
            <li key={v.user.id ?? v.user.server_user_id} className="flex items-center gap-2 text-sm">
              <UserAvatar user={v.user} />
              <span className="font-medium">{playUserName(v.user)}</span>
              <span className="text-xs text-muted">
                {t.watch.episodesSeen(seen)} · {t.watch.last(formatDateTime(v.last))}
              </span>
            </li>
          );
        })}
      </ul>
      {s.data.truncated && <p className="text-xs text-muted">{t.watch.truncated}</p>}
    </Section>
  );
}

/** Avatares de quien ha visto un episodio; al pulsar se despliega quién y cuándo. */
export function EpisodeViewersButton({ plays, open, onToggle }: { plays: Play[]; open: boolean; onToggle: () => void }) {
  const users = new Map<string, PlayUser>();
  for (const p of plays) users.set(p.user.id ?? p.user.server_user_id, p.user);
  const list = [...users.values()];
  const names = list.map((u) => u.username ?? "?").join(", ");
  return (
    <button
      className="flex w-20 items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-surface-2"
      title={t.watch.episodeViewers(names)}
      aria-label={t.watch.episodeViewers(names)}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="flex -space-x-1.5">
        {list.slice(0, 3).map((u) => (
          <UserAvatar key={u.id ?? u.server_user_id} user={u} className="h-5 w-5 ring-2 ring-surface" />
        ))}
      </span>
      {list.length > 3 && <span className="text-xs text-muted">+{list.length - 3}</span>}
      <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} />
    </button>
  );
}
