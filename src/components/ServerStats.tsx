import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Cpu, HardDrive, MemoryStick, Server, Thermometer } from "lucide-react";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatAge, formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { ErrorPanel } from "@/components/ErrorPanel";
import { useServerSystems } from "@/hooks/useBeszel";
import type { ServerSystem, SystemStatus, Usage } from "@/api/beszel";

type Tone = "accent" | "warning" | "danger";

const pctTone = (pct: number): Tone => (pct >= 90 ? "danger" : pct >= 75 ? "warning" : "accent");
const tempTone = (c: number): Tone => (c >= 85 ? "danger" : c >= 70 ? "warning" : "accent");
const toneText: Record<Tone, string> = { accent: "text-fg", warning: "text-warning", danger: "text-danger" };
const toneBar: Record<Tone, string> = { accent: "bg-accent", warning: "bg-warning", danger: "bg-danger" };
const fmtPct = (n: number) => `${n < 10 ? n.toFixed(1).replace(".", ",") : Math.round(n)}`;
const fmtLoad = (n: number) => n.toFixed(2).replace(".", ",");

const statusStyle: Record<SystemStatus, string> = {
  up: "bg-success/15 text-success",
  down: "bg-danger/15 text-danger",
  paused: "bg-surface-2 text-muted",
  pending: "bg-warning/15 text-warning",
};

function Bar({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div className={cn("h-full rounded-full transition-[width] duration-700", toneBar[tone])} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

/** Una medida grande (CPU, memoria, disco, temperatura): cifra, unidad, barra y detalle. */
function Gauge({
  icon,
  label,
  value,
  unit,
  pct,
  tone,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  pct: number;
  tone: Tone;
  detail?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface-2/60 p-3" role="group" aria-label={`${label}: ${value} ${unit}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className={cn("font-display text-3xl font-bold leading-none tabular-nums", toneText[tone])} style={{ fontStretch: "78%" }}>
        {value}
        <span className="ml-0.5 text-base font-semibold text-muted">{unit}</span>
      </div>
      <Bar pct={pct} tone={tone} />
      <div className="truncate text-xs tabular-nums text-muted" title={detail ?? undefined}>
        {detail || " "}
      </div>
    </div>
  );
}

function usageDetail(u: Usage) {
  return u.used != null && u.total ? t.server.of(formatBytes(u.used), formatBytes(u.total)) : null;
}

function Stat({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2" title={title}>
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function SystemCard({ sys }: { sys: ServerSystem }) {
  const live = sys.status === "up";
  const sub = [sys.hostname && sys.hostname !== sys.name ? sys.hostname : null, sys.os].filter(Boolean).join(" · ");
  const cpuSub = [sys.cpuModel, sys.cores ? t.server.cores(sys.cores, sys.threads ?? 0) : null].filter(Boolean).join(" · ");
  return (
    <article className="card flex flex-col gap-4 p-4" aria-label={sys.name}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Server className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold leading-tight">{sys.name}</h3>
            <span className={cn("chip shrink-0 whitespace-nowrap", statusStyle[sys.status])}>
              <span className={cn("h-1.5 w-1.5 rounded-full bg-current", live && "animate-pulse")} aria-hidden />
              {t.server.status[sys.status]}
            </span>
          </div>
          {sub && (
            <p className="truncate text-xs text-muted" title={sub}>
              {sub}
            </p>
          )}
        </div>
        {sys.uptime != null && live && (
          <div className="text-right">
            <div className="text-xs text-muted">{t.server.uptime}</div>
            <div className="text-sm font-medium tabular-nums">{formatDuration(sys.uptime)}</div>
          </div>
        )}
      </header>

      {!live ? (
        <p className="text-sm text-muted">{sys.status === "paused" ? t.server.pausedHint : t.server.noData(formatAge(sys.updated))}</p>
      ) : (
        <LiveStats sys={sys} cpuSub={cpuSub} />
      )}
    </article>
  );
}

function LiveStats({ sys, cpuSub }: { sys: ServerSystem; cpuSub: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sys.cpu != null && (
          <Gauge
            icon={<Cpu className="h-3.5 w-3.5" aria-hidden />}
            label={t.server.cpu}
            value={fmtPct(sys.cpu)}
            unit="%"
            pct={sys.cpu}
            tone={pctTone(sys.cpu)}
            detail={cpuSub}
          />
        )}
        {sys.memory && (
          <Gauge
            icon={<MemoryStick className="h-3.5 w-3.5" aria-hidden />}
            label={t.server.memory}
            value={fmtPct(sys.memory.pct)}
            unit="%"
            pct={sys.memory.pct}
            tone={pctTone(sys.memory.pct)}
            detail={usageDetail(sys.memory)}
          />
        )}
        {sys.disk && (
          <Gauge
            icon={<HardDrive className="h-3.5 w-3.5" aria-hidden />}
            label={t.server.disk}
            value={fmtPct(sys.disk.pct)}
            unit="%"
            pct={sys.disk.pct}
            tone={pctTone(sys.disk.pct)}
            detail={usageDetail(sys.disk)}
          />
        )}
        {sys.temp != null && (
          <Gauge
            icon={<Thermometer className="h-3.5 w-3.5" aria-hidden />}
            label={t.server.temp}
            value={String(Math.round(sys.temp))}
            unit="°C"
            pct={Math.min(100, sys.temp)}
            tone={tempTone(sys.temp)}
            detail={sys.sensors[0] ? `${sys.sensors[0].name}` : null}
          />
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {sys.load && (
          <Stat label={t.server.load} title={t.server.loadTitle}>
            {sys.load.map(fmtLoad).join(" · ")}
          </Stat>
        )}
        {(sys.netUp != null || sys.net != null) && (
          <Stat label={t.server.network}>
            {sys.netUp != null && sys.netDown != null ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-0.5">
                  <ArrowDown className="h-3.5 w-3.5 text-muted" aria-label="Bajada" />
                  {formatSpeed(sys.netDown)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ArrowUp className="h-3.5 w-3.5 text-muted" aria-label="Subida" />
                  {formatSpeed(sys.netUp)}
                </span>
              </span>
            ) : (
              formatSpeed(sys.net)
            )}
          </Stat>
        )}
        {sys.gpu != null && <Stat label={t.server.gpu}>{fmtPct(sys.gpu)} %</Stat>}
        {sys.swap && sys.swap.total ? (
          <Stat label={t.server.swap}>{t.server.of(formatBytes(sys.swap.used ?? 0), formatBytes(sys.swap.total))}</Stat>
        ) : null}
        {sys.agent && <Stat label="Beszel">{t.server.agent(sys.agent)}</Stat>}
      </dl>

      {sys.disks.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t.server.disks}>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{t.server.disks}</h4>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {sys.disks.map((d) => (
              <div key={d.name} className="flex min-w-0 items-center gap-3" title={usageDetail(d.usage) ?? undefined}>
                <span className="w-28 shrink-0 truncate text-sm">{d.name}</span>
                <div className="flex-1">
                  <Bar pct={d.usage.pct} tone={pctTone(d.usage.pct)} />
                </div>
                <span className={cn("w-12 shrink-0 text-right text-sm tabular-nums", toneText[pctTone(d.usage.pct)])}>
                  {fmtPct(d.usage.pct)} %
                </span>
                <span className="hidden w-32 shrink-0 text-right text-xs tabular-nums text-muted xl:block">{usageDetail(d.usage)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {sys.sensors.length > 1 && (
        <section className="flex flex-wrap items-center gap-1.5" aria-label={t.server.sensors}>
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">{t.server.sensors}</span>
          {sys.sensors.slice(0, 8).map((s) => (
            <span key={s.name} className="chip bg-surface-2 tabular-nums text-muted">
              {s.name}
              <span className={cn("font-semibold", toneText[tempTone(s.temp)])}>{Math.round(s.temp)}°</span>
            </span>
          ))}
        </section>
      )}
    </>
  );
}

/** Inicio → estado del servidor, sacado de Beszel. No aparece si Beszel no está configurado. */
export function ServerStats() {
  const q = useServerSystems();
  if (q.configured !== true) return null;
  const systems = q.data ?? [];
  return (
    <section className="flex flex-col gap-3" data-service="beszel" aria-label={t.server.title(systems.length || 1)}>
      <h2 className="text-lg font-semibold">{t.server.title(systems.length || 1)}</h2>
      {q.isLoading ? (
        <div className="card h-40 animate-pulse" aria-busy />
      ) : q.isError ? (
        <ErrorPanel service="beszel" error={q.error} onRetry={() => q.refetch()} compact />
      ) : systems.length === 0 ? (
        <p className="card p-4 text-sm text-muted">{t.server.none}</p>
      ) : (
        <div className="grid gap-3">
          {systems.map((s) => (
            <SystemCard key={s.id} sys={s} />
          ))}
        </div>
      )}
    </section>
  );
}
