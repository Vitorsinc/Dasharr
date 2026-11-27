import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Spinner } from "@/components/ui";
import { Poster } from "@/components/media/PosterCard";
import { posterUrl } from "@/api/arr";
import type { MonitorOption, SeriesType } from "@/api/sonarr";
import type { DealChoice, DealPlan } from "@/api/trackerGrab";
import { seriesTypeLabel } from "@/lib/anime";
import { formatBytes } from "@/lib/format";
import { t } from "@/i18n/es";

type NewPlan = Extract<DealPlan, { status: "new" }>;

/** Antes de añadir un freeleech a Radarr/Sonarr: carpeta y perfil de calidad, como al añadir desde Películas o Series. */
export function DealAddDialog({
  plan,
  fallbackPoster,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: NewPlan | null;
  fallbackPoster?: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (c: DealChoice) => void;
}) {
  const [profileId, setProfileId] = useState<number | "">("");
  const [root, setRoot] = useState("");
  const [seriesType, setSeriesType] = useState<SeriesType>("standard");
  const [monitor, setMonitor] = useState<MonitorOption>("all");

  useEffect(() => {
    if (!plan) return;
    setProfileId(plan.defaults.qualityProfileId ?? plan.profiles[0]?.id ?? "");
    setRoot(plan.defaults.rootFolderPath ?? plan.roots[0]?.path ?? "");
    setSeriesType(plan.service === "sonarr" ? plan.seriesType : "standard");
    setMonitor("all");
  }, [plan]);

  const arr = plan ? t.services[plan.service] : "";
  const item = plan?.item;
  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && !busy && onCancel()} title={t.trackers.deals.addTitle(arr)} wide>
      {plan && item && (
        <div className="flex gap-5">
          <Poster
            src={posterUrl(plan.service, { images: item.images }) ?? fallbackPoster ?? undefined}
            title={item.title}
            className="w-36 shrink-0 max-sm:hidden"
          />
          <form
            className="flex min-w-0 flex-1 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (profileId === "" || !root) return;
              onConfirm({
                qualityProfileId: profileId,
                rootFolderPath: root,
                ...(plan.service === "sonarr" ? { seriesType, monitor } : {}),
              });
            }}
          >
            <div>
              <h3 className="text-lg font-semibold">
                {item.title} {item.year ? <span className="text-muted">({item.year})</span> : null}
              </h3>
              <p className="mt-1 text-sm text-muted">{t.trackers.deals.addHint(arr)}</p>
            </div>
            <label>
              <span className="label">{t.library.qualityProfile}</span>
              <select className="input" value={profileId} onChange={(e) => setProfileId(Number(e.target.value))}>
                {plan.profiles.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{t.library.rootFolder}</span>
              <select className="input" value={root} onChange={(e) => setRoot(e.target.value)}>
                {plan.roots.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path}
                    {f.freeSpace != null ? ` (${formatBytes(f.freeSpace)} libres)` : ""}
                  </option>
                ))}
              </select>
            </label>
            {plan.service === "sonarr" && (
              <>
                <label>
                  <span className="label">{t.library.seriesType}</span>
                  <select className="input" value={seriesType} onChange={(e) => setSeriesType(e.target.value as SeriesType)}>
                    {(Object.keys(seriesTypeLabel) as SeriesType[]).map((v) => (
                      <option key={v} value={v}>
                        {seriesTypeLabel[v]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">{t.library.monitor}</span>
                  <select className="input" value={monitor} onChange={(e) => setMonitor(e.target.value as MonitorOption)}>
                    <option value="all">{t.library.monitorAll}</option>
                    <option value="future">{t.library.monitorFuture}</option>
                    <option value="latestSeason">{t.library.monitorLatest}</option>
                  </select>
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
                {t.common.cancel}
              </button>
              <button type="submit" className="btn-primary" disabled={busy || profileId === "" || !root}>
                {busy && <Spinner className="h-4 w-4 text-current" />}
                {t.trackers.deals.addAndSend}
              </button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}
