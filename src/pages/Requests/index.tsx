import { useState, type ReactNode } from "react";
import { CircleAlert, Inbox, Users, type LucideIcon } from "lucide-react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Page } from "@/components/Page";
import { TabNav } from "@/components/TabNav";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Pager, Segmented } from "@/components/ui";
import { RequestRow } from "@/components/seerr/RequestRow";
import { useIsConfigured } from "@/hooks/useSettings";
import { SEERR_PAGE, useSeerrCounts, useSeerrRequests, useSeerrUsers } from "@/hooks/useSeerr";
import { userName, type MediaType, type RequestCounts, type RequestFilter } from "@/api/seerr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { SeerrIssues } from "./Issues";
import { SeerrUsers } from "./Users";

const FILTERS: { id: RequestFilter; count?: keyof RequestCounts }[] = [
  { id: "pending", count: "pending" },
  { id: "approved", count: "approved" },
  { id: "processing", count: "processing" },
  { id: "available", count: "available" },
  { id: "failed" },
  { id: "all", count: "total" },
];

function RequestList() {
  const [params, setParams] = useSearchParams();
  const requestedBy = params.get("usuario") ? Number(params.get("usuario")) : undefined;
  const counts = useSeerrCounts();
  const users = useSeerrUsers();
  const [filter, setFilter] = useState<RequestFilter>(requestedBy ? "all" : "pending");
  const [mediaType, setMediaType] = useState<MediaType | "all">("all");
  const [sort, setSort] = useState<"added" | "modified">("added");
  const [page, setPage] = useState(1);
  const q = useSeerrRequests({ filter, page, mediaType, sort, requestedBy });
  const who = requestedBy ? users.data?.results.find((u) => u.id === requestedBy) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {requestedBy && (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{t.seerr.forUser(who ? userName(who) : `#${requestedBy}`)}</span>
          <button className="text-accent hover:underline" onClick={() => setParams({})}>
            {t.seerr.clearUser}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t.seerr.filterLabel}>
          {FILTERS.map((f) => {
            const n = f.count ? counts.data?.[f.count] : undefined;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  filter === f.id ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg",
                )}
              >
                {t.seerr.filters[f.id as keyof typeof t.seerr.filters]}
                {n !== undefined && n > 0 && <span className="tabular-nums opacity-80">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            label={t.seerr.typeLabel}
            value={mediaType}
            onChange={(v) => {
              setMediaType(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: t.seerr.typeAll },
              { value: "movie", label: t.seerr.movies },
              { value: "tv", label: t.seerr.series },
            ]}
          />
          <select className="input w-auto" aria-label={t.seerr.sortLabel} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="added">{t.seerr.sortAdded}</option>
            <option value="modified">{t.seerr.sortModified}</option>
          </select>
        </div>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="seerr" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <div className="card">
          <Empty>{t.seerr.empty}</Empty>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-border">
            {q.data.results.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </div>
          <Pager page={page} pageSize={SEERR_PAGE} total={q.data.pageInfo.results} onPage={setPage} />
        </>
      )}
    </div>
  );
}

const tabs: { id: string; label: string; icon: LucideIcon; render: () => ReactNode }[] = [
  { id: "lista", label: t.seerr.tabs.requests, icon: Inbox, render: () => <RequestList /> },
  { id: "incidencias", label: t.seerr.tabs.issues, icon: CircleAlert, render: () => <SeerrIssues /> },
  { id: "usuarios", label: t.seerr.tabs.users, icon: Users, render: () => <SeerrUsersTab /> },
];

function SeerrUsersTab() {
  const navigate = useNavigate();
  return <SeerrUsers onShowRequests={(id) => navigate(`/solicitudes?usuario=${id}`)} />;
}

/** Seerr: solicitudes (aprobar, rechazar, reintentar, borrar), incidencias y usuarios con sus cupos. */
export default function RequestsPage() {
  const { tab = tabs[0].id } = useParams();
  const [params] = useSearchParams();
  const configured = useIsConfigured("seerr");
  const current = tabs.find((x) => x.id === tab);
  if (!current) return <Navigate to="/solicitudes" replace />;
  return (
    <Page title={t.nav.requests}>
      {configured === false ? (
        <NotConfigured service="seerr" />
      ) : (
        <>
          <TabNav tabs={tabs} current={current.id} base="/solicitudes" label={t.seerr.tabsLabel} />
          <div key={`${current.id}-${params.get("usuario") ?? ""}`}>{current.render()}</div>
        </>
      )}
    </Page>
  );
}
