import { useMemo, useState } from "react";
import { Pencil, RotateCcw, Search } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented, Spinner, Toggle } from "@/components/ui";
import { bazarr } from "@/api/bazarr";
import { useRun } from "@/hooks/useArrManage";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { enabledProviders, providerRows, retryText, throttleReason, type ProviderRow, type ProviderState } from "@/lib/bazarrProviders";
import { ProviderDialog } from "./ProviderDialog";

type View = "active" | "all";

const stateStyle: Record<Exclude<ProviderState, "off">, string> = {
  ok: "bg-success/15 text-success",
  throttled: "bg-danger/15 text-danger",
  missing: "bg-warning/15 text-warning",
};

function StateChip({ row }: { row: ProviderRow }) {
  if (row.state === "off") return null;
  const label =
    row.state === "ok"
      ? t.subProviders.ok
      : row.state === "missing"
        ? t.subProviders.missing
        : t.subProviders.throttled(throttleReason(row.status?.status ?? ""), retryText(row.status?.retry ?? ""));
  const hint = row.state === "throttled" ? `${row.status?.status} · ${t.subProviders.throttledHint}` : row.state === "missing" ? t.subProviders.missingHint : undefined;
  return (
    <span className={cn("chip max-w-full whitespace-normal", stateStyle[row.state])} title={hint}>
      {label}
    </span>
  );
}

/** Bazarr: proveedores de subtítulos (activar, configurar y desbloquear los que están en pausa). */
export default function SubtitleProvidersPage() {
  const run = useRun("bazarr");
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const settings = useServiceQuery("bazarr", ["provider-settings"], bazarr.getSettings, { refetchInterval: REFRESH.status });
  const status = useServiceQuery("bazarr", ["provider-status"], bazarr.getProviderStatus, { refetchInterval: REFRESH.status });

  const rows = useMemo(() => providerRows(settings.data, status.data), [settings.data, status.data]);
  const active = rows.filter((r) => r.enabled);
  const blocked = active.filter((r) => r.state === "throttled").length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = view === "active" ? rows.filter((r) => r.enabled) : rows;
    return q ? base.filter((r) => `${r.name} ${r.key} ${r.description ?? ""}`.toLowerCase().includes(q)) : base;
  }, [rows, view, query]);

  if (settings.configured === false)
    return (
      <Page title={t.nav.subtitleProviders}>
        <NotConfigured service="bazarr" />
      </Page>
    );

  const invalidate = [["bazarr", "provider-settings"], ["bazarr", "provider-status"]];

  async function toggle(row: ProviderRow) {
    // Activar uno que pide datos abre sus ajustes, como en Bazarr; el resto se cambia al momento.
    if (!row.enabled && row.fields.length) return setEditing(row);
    const current = enabledProviders(settings.data);
    const next = row.enabled ? current.filter((k) => k !== row.key) : [...current, row.key];
    setToggling(row.key);
    await run(() => bazarr.setEnabledProviders(next), t.subProviders.toggled(row.name, !row.enabled), invalidate);
    setToggling(null);
  }

  async function reset() {
    setResetting(true);
    await run(bazarr.resetProviders, t.subProviders.resetDone, invalidate);
    setResetting(false);
  }

  const loading = settings.isLoading || settings.configured === undefined;

  return (
    <Page
      title={t.nav.subtitleProviders}
      actions={
        <>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: `${t.subProviders.active}${settings.data ? ` (${active.length})` : ""}` },
              { value: "all", label: `${t.subProviders.all}${settings.data ? ` (${rows.length})` : ""}` },
            ]}
          />
          <button className="btn-outline" disabled={resetting || !active.length} onClick={reset} title={t.subProviders.throttledHint}>
            {resetting ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" aria-hidden />} {t.subProviders.reset}
          </button>
        </>
      }
    >
      <p className="-mt-2 text-sm text-muted">{t.subProviders.hint}</p>
      {loading ? (
        <Loading />
      ) : settings.isError ? (
        <ErrorPanel service="bazarr" error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {t.subProviders.activeCount(active.length)}
              {blocked > 0 && <span className="text-danger"> · {t.subProviders.blockedCount(blocked)}</span>}
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.subProviders.filter}
                aria-label={t.subProviders.filter}
              />
            </div>
          </div>
          {status.isError && <ErrorPanel service="bazarr" error={status.error} onRetry={() => status.refetch()} compact />}
          {!shown.length ? (
            <Empty>{query ? t.subProviders.noMatch : t.subProviders.noneActive}</Empty>
          ) : (
            <div className="card divide-y divide-border">
              {shown.map((r) => (
                <div key={r.key} className="flex items-center gap-3 px-4 py-3 md:gap-4">
                  {toggling === r.key ? (
                    <span className="flex w-11 shrink-0 justify-center">
                      <Spinner className="h-5 w-5" />
                    </span>
                  ) : (
                    <Toggle checked={r.enabled} onChange={() => toggle(r)} label={r.enabled ? t.subProviders.disable(r.name) : t.subProviders.enable(r.name)} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("truncate text-sm font-medium", !r.enabled && "text-muted")}>{r.name}</span>
                      <StateChip row={r} />
                    </div>
                    {r.description && (
                      <div className="truncate text-xs text-muted" title={r.description}>
                        {r.description}
                      </div>
                    )}
                  </div>
                  {r.fields.length > 0 && (
                    <button className="btn-ghost p-1.5" aria-label={t.subProviders.edit(r.name)} title={t.common.edit} onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {editing && <ProviderDialog row={editing} settings={settings.data} onClose={() => setEditing(null)} />}
    </Page>
  );
}
