import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Spinner } from "@/components/ui";
import { bazarr, type ManualSubTarget, type SubtitleCandidate } from "@/api/bazarr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const isTrue = (v: string | undefined) => String(v).toLowerCase() === "true";

function scoreTone(score: number) {
  return score >= 90 ? "text-success" : score >= 70 ? "text-warning" : "text-muted";
}

/** Búsqueda manual de Bazarr: lista los subtítulos de todos los proveedores, de más a menos puntuación. */
export function ManualSubtitleDialog({ target, what, onClose }: { target: ManualSubTarget | null; what: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [lang, setLang] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const key = target ? (target.kind === "movie" ? `m${target.radarrId}` : `e${target.episodeId}`) : "";
  const q = useQuery({
    queryKey: ["bazarr", "manual", key],
    queryFn: () => bazarr.manualSearch(target!),
    enabled: !!target,
    // Cada apertura debe buscar de nuevo en los proveedores: sin caché ni refetch al volver a la ventana (la búsqueda tarda minutos).
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const langs = useMemo(() => [...new Set((q.data ?? []).map((c) => c.language))].sort(), [q.data]);
  const list = useMemo(
    () => [...(q.data ?? [])].filter((c) => !lang || c.language === lang).sort((a, b) => b.score - a.score),
    [q.data, lang],
  );
  if (!target) return null;
  async function download(c: SubtitleCandidate) {
    setBusy(c.subtitle);
    try {
      await bazarr.downloadCandidate(target!, c);
      toast.success(t.subtitles.downloaded(c.language));
      await qc.invalidateQueries({ queryKey: ["bazarr"] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "bazarr"));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.subtitles.manualTitle(what)} wide="xl">
      {q.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> {t.subtitles.manualSearching}
        </div>
      ) : q.isError ? (
        <ErrorPanel service="bazarr" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Empty>{t.subtitles.manualNone}</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{t.subtitles.manualCount(list.length)}</span>
            {langs.length > 1 && (
              <select
                className="input ml-auto w-auto py-1"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label={t.subtitles.filterLang}
              >
                <option value="">{t.subtitles.allLangs}</option>
                {langs.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="w-20 py-1 font-medium">{t.subtitles.score}</th>
                <th className="w-28 py-1 font-medium">{t.subtitles.language}</th>
                <th className="w-36 py-1 font-medium">{t.subtitles.provider}</th>
                <th className="py-1 font-medium">{t.subtitles.release}</th>
                <th className="w-28 py-1" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={`${c.provider}-${c.subtitle}`} className="border-t border-border align-top">
                  <td className={cn("py-2 font-semibold tabular-nums", scoreTone(c.score))}>{c.score} %</td>
                  <td className="py-2">
                    <div>{c.language}</div>
                    <div className="flex gap-1">
                      {isTrue(c.forced) && <span className="chip bg-surface-2 text-muted">{t.subtitles.forced}</span>}
                      {isTrue(c.hearing_impaired) && <span className="chip bg-surface-2 text-muted">{t.subtitles.hi}</span>}
                    </div>
                  </td>
                  <td className="py-2">
                    <div>{c.provider}</div>
                    {c.uploader && <div className="truncate text-xs text-muted">{c.uploader}</div>}
                  </td>
                  <td className="max-w-0 py-2">
                    {(c.release_info?.length ? c.release_info : ["—"]).slice(0, 3).map((r, i) => (
                      <div key={i} className="truncate font-mono text-xs" title={r}>
                        {r}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-outline px-2.5 py-1.5"
                      disabled={busy !== null}
                      aria-label={`${t.subtitles.download}: ${c.provider} ${c.language} ${c.score}`}
                      onClick={() => download(c)}
                    >
                      {busy === c.subtitle ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} {t.subtitles.download}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
