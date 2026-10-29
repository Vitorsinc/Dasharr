import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Info, XCircle } from "lucide-react";
import { getHealth, type HealthService } from "@/api/health";
import { REFRESH } from "@/hooks/useServiceQuery";
import { useSettings } from "@/hooks/useSettings";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { openExternal } from "@/lib/tauri";

const icon = { notice: Info, warning: AlertTriangle, error: XCircle } as const;
const tone = { notice: "text-muted", warning: "text-warning", error: "text-danger" } as const;

/**
 * Avisos de salud de los servicios configurados (lo que cada uno enseña en System → Status):
 * disco, indexadores caídos, carpetas que faltan, actualizaciones…
 */
export function HealthList({ services, hideWhenOk }: { services: HealthService[]; hideWhenOk?: boolean }) {
  const settings = useSettings();
  const configured = services.filter((s) => {
    const c = settings.data?.[s]?.config;
    return !!c && c.enabled && !!(c.localUrl?.trim() || c.externalUrl?.trim());
  });
  const results = useQueries({
    queries: configured.map((s) => ({
      queryKey: [s, "health"],
      queryFn: () => getHealth(s),
      refetchInterval: REFRESH.status,
      retry: false,
    })),
  });
  const items = configured.flatMap((s, i) => (results[i]?.data ?? []).map((h) => ({ ...h, service: s })));
  if (!items.length) return hideWhenOk || !configured.length ? null : <p className="text-sm text-muted">{t.health.allOk}</p>;
  return (
    <section className="card divide-y divide-border" aria-label={t.health.title}>
      {items.map((h, i) => {
        const kind = h.type === "error" || h.type === "warning" ? h.type : "notice";
        const Icon = icon[kind];
        return (
          <div key={`${h.service}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone[kind])} aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="mr-2 text-xs font-medium uppercase text-muted">{t.services[h.service]}</span>
              {h.message}
            </div>
            {h.wikiUrl && (
              <button
                className="btn-ghost shrink-0 p-1"
                title={t.health.more}
                aria-label={t.health.more}
                onClick={() => openExternal(h.wikiUrl!)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
