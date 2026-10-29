import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Page } from "@/components/Page";
import { NowPlaying } from "@/components/plex/NowPlaying";
import { Loading, ProgressBar, Spinner } from "@/components/ui";
import { plex, type PlexSection } from "@/api/plex";
import { usePlexServer } from "@/hooks/usePlex";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatPercent } from "@/lib/format";

// Mientras haya tareas en curso (un escaneo, por ejemplo) se consulta más a menudo.
const BUSY_REFRESH = 3_000;

function useRun() {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["plex"] });
    } catch (e) {
      toast.error(errorMessage(e, "plex"));
    }
  };
}

function Stat({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

const pct = (v?: number) => (v == null ? undefined : formatPercent(v / 100));

function Server() {
  const server = usePlexServer();
  const update = useServiceQuery("plex", ["update"], plex.update, { staleTime: REFRESH.library });
  const res = useServiceQuery("plex", ["resources"], plex.resources, { refetchInterval: 15_000 });
  const activities = useServiceQuery("plex", ["activities"], plex.activities, {
    refetchInterval: (q) => (q.state.data?.length ? BUSY_REFRESH : 15_000),
  });
  if (server.isError) return <ErrorPanel service="plex" error={server.error} onRetry={() => server.refetch()} />;
  if (server.isLoading) return <Loading />;
  const s = server.data;
  const u = update.data;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.plex.server}</h2>
      <div className="card flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t.plex.server} value={s?.friendlyName} />
          <Stat
            label={t.plex.version}
            value={
              <>
                {s?.version?.split("-")[0]}
                <span className={u?.version ? "ml-2 text-warning" : "ml-2 text-muted"}>
                  {u?.version ? t.plex.updateAvailable(u.version.split("-")[0]) : update.isSuccess ? t.plex.upToDate : ""}
                </span>
              </>
            }
          />
          <Stat label={t.plex.cpu} value={pct(res.data?.hostCpuUtilization)} />
          <Stat label={t.plex.memory} value={pct(res.data?.hostMemoryUtilization)} />
        </div>
        <div>
          <div className="mb-2 text-xs text-muted">{t.plex.tasks}</div>
          {!activities.data?.length ? (
            <div className="text-sm text-muted">{t.plex.noTasks}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {activities.data.map((a) => (
                <div key={a.uuid} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="truncate">
                      {a.title}
                      {a.subtitle && <span className="ml-2 text-muted">{a.subtitle}</span>}
                    </span>
                    {a.progress != null && <span className="tabular-nums text-muted">{a.progress}%</span>}
                  </div>
                  <ProgressBar value={(a.progress ?? 0) / 100} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Libraries() {
  const run = useRun();
  const sections = useServiceQuery("plex", ["sections"], plex.sections, {
    refetchInterval: (q) => (q.state.data?.some((s) => s.refreshing) ? BUSY_REFRESH : REFRESH.library),
  });
  const [trash, setTrash] = useState<PlexSection | null>(null);
  if (sections.isError || sections.isLoading) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.plex.libraries}</h2>
        <button className="btn-outline" onClick={() => run(plex.scanAll, t.plex.scanAllStarted)}>
          <ScanSearch className="h-4 w-4" /> {t.plex.scanAll}
        </button>
      </div>
      <div className="card divide-y divide-border">
        {(sections.data ?? []).map((s) => (
          <div key={s.key} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 truncate text-sm font-medium">{s.title}</span>
            {s.refreshing && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Spinner className="h-3.5 w-3.5" /> {t.plex.scanning}
              </span>
            )}
            <button className="btn-ghost py-1 text-xs" onClick={() => run(() => plex.scanSection(s.key), t.plex.scanStarted(s.title))}>
              <ScanSearch className="h-3.5 w-3.5" /> {t.plex.scan}
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={() => setTrash(s)}>
              <Trash2 className="h-3.5 w-3.5" /> {t.plex.emptyTrash}
            </button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!trash}
        onOpenChange={(o) => !o && setTrash(null)}
        title={t.plex.emptyTrash}
        message={trash?.title}
        confirmLabel={t.plex.emptyTrash}
        onConfirm={() => trash && run(() => plex.emptyTrash(trash.key), t.plex.trashEmptied(trash.title))}
      />
    </section>
  );
}

function Maintenance() {
  const run = useRun();
  const [confirm, setConfirm] = useState<"bundles" | "optimize" | null>(null);
  const tasks = {
    bundles: { label: t.plex.cleanBundles, hint: t.plex.cleanBundlesHint, icon: Sparkles, fn: plex.cleanBundles },
    optimize: { label: t.plex.optimize, hint: t.plex.optimizeHint, icon: Database, fn: plex.optimize },
  };
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t.plex.maintenance}</h2>
        <p className="text-sm text-muted">{t.plex.maintenanceHint}</p>
      </div>
      <div className="card divide-y divide-border">
        {(Object.keys(tasks) as (keyof typeof tasks)[]).map((k) => {
          const { label, hint, icon: Icon } = tasks[k];
          return (
            <div key={k} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted">{hint}</div>
              </div>
              <button className="btn-outline" onClick={() => setConfirm(k)}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? tasks[confirm].label : ""}
        message={confirm ? tasks[confirm].hint : ""}
        confirmLabel={t.common.confirm}
        onConfirm={() => confirm && run(tasks[confirm].fn, t.plex.started)}
      />
    </section>
  );
}

export default function PlexPage() {
  const server = usePlexServer();
  if (server.configured === false)
    return (
      <Page title={t.plex.title}>
        <ErrorPanel service="plex" error={{ kind: "NotConfigured" }} />
      </Page>
    );
  return (
    <Page title={t.plex.title}>
      <NowPlaying />
      <Server />
      <Libraries />
      <Maintenance />
    </Page>
  );
}
