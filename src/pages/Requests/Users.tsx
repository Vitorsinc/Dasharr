import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, ProgressBar } from "@/components/ui";
import { SeerrAvatar } from "@/components/seerr/RequestRow";
import { userName, type QuotaPart, type SeerrUser } from "@/api/seerr";
import { useSeerrQuota, useSeerrUsers } from "@/hooks/useSeerr";
import { t } from "@/i18n/es";

function QuotaCell({ label, part }: { label: string; part: QuotaPart | undefined }) {
  if (!part) return <div className="w-40 text-xs text-muted">{label}: …</div>;
  const limited = !!part.limit;
  return (
    <div className="w-40" title={label}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm tabular-nums">{t.seerr.quota(part.used, part.limit, part.days)}</div>
      {limited && <ProgressBar value={part.used / (part.limit || 1)} tone={part.restricted ? "danger" : "accent"} className="mt-1" />}
    </div>
  );
}

function UserRow({ user, onShowRequests }: { user: SeerrUser; onShowRequests: (id: number) => void }) {
  const quota = useSeerrQuota(user.id);
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <SeerrAvatar user={user} className="h-9 w-9 text-sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{userName(user)}</div>
        <div className="truncate text-xs text-muted">
          {user.email && user.email !== userName(user) ? `${user.email} · ` : ""}
          {t.seerr.userRequests(user.requestCount ?? 0)}
        </div>
      </div>
      <QuotaCell label={t.seerr.quotaMovies} part={quota.data?.movie} />
      <QuotaCell label={t.seerr.quotaTv} part={quota.data?.tv} />
      <button className="btn-outline px-2.5 py-1.5" onClick={() => onShowRequests(user.id)}>
        {t.seerr.seeRequests}
      </button>
    </div>
  );
}

/** Usuarios de Seerr con cuántas solicitudes llevan y su cupo de películas y temporadas. */
export function SeerrUsers({ onShowRequests }: { onShowRequests: (id: number) => void }) {
  const q = useSeerrUsers();
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorPanel service="seerr" error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.results.length) return <Empty>{t.seerr.usersEmpty}</Empty>;
  return (
    <div className="card divide-y divide-border">
      {q.data.results.map((u) => (
        <UserRow key={u.id} user={u} onShowRequests={onShowRequests} />
      ))}
    </div>
  );
}
