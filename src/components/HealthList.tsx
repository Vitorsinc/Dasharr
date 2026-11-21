import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Info, XCircle } from "lucide-react";
import { useEffect } from "react";
import { getHealth, HEALTH_SERVICES, type HealthService } from "@/api/health";
import { setHealthNotices } from "@/lib/errorLog";
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
export function useHealthItems(services: HealthService[]) {
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
  return { items, configured };
}

/** Los avisos de salud de Radarr, Sonarr, Prowlarr y Bazarr van a la campanita junto al nombre de Dasharr. */
export function useHealthInBell() {
  const { items } = useHealthItems(HEALTH_SERVICES);
  const key = JSON.stringify(items.map((h) => [h.service, h.type, h.message, h.wikiUrl]));
  useEffect(() => {
    setHealthNotices(
      items.map((h) => ({
        source: t.services[h.service],
        message: h.message,
        level: h.type === "error" || h.type === "warning" ? h.type : "notice",
        link: h.wikiUrl ?? undefined,
      })),
    );
  }, [key]);
}

export function HealthList({ services, hideWhenOk }: { services: HealthService[]; hideWhenOk?: boolean }) {
  const { items, configured } = useHealthItems(services);
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
