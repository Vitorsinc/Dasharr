import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Spinner } from "@/components/ui";
import {
  commandSucceeded,
  getManualImport,
  rejectionText,
  runManualImport,
  type ArrService,
  type ImportMode,
  type ManualImportItem,
  type ManualImportTarget,
  waitForCommand,
} from "@/api/arr";
import { useEpisodes, useMovies, useSeries } from "@/hooks/useArr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

interface Row {
  item: ManualImportItem;
  selected: boolean;
  seriesId?: number;
  seasonNumber?: number;
  episodeIds: number[];
  movieId?: number;
}

function initialRow(item: ManualImportItem): Row {
  const episodeIds = item.episodes?.map((e) => e.id) ?? [];
  const seriesId = item.series?.id;
  const movieId = item.movie?.id;
  return {
    item,
    seriesId,
    seasonNumber: item.seasonNumber ?? item.episodes?.[0]?.seasonNumber,
    episodeIds,
    movieId,
    selected: movieId != null || (seriesId != null && episodeIds.length > 0),
  };
}

function targetOf(service: ArrService, r: Row): ManualImportTarget | null {
  if (service === "radarr") return r.movieId != null ? { movieId: r.movieId } : null;
  if (r.seriesId == null || r.seasonNumber == null || !r.episodeIds.length) return null;
  return { seriesId: r.seriesId, seasonNumber: r.seasonNumber, episodeIds: r.episodeIds };
}

function EpisodePicker({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const episodes = useEpisodes(row.seriesId);
  const seasons = useMemo(() => [...new Set((episodes.data ?? []).map((e) => e.seasonNumber))].sort((a, b) => a - b), [episodes.data]);
  const inSeason = (episodes.data ?? [])
    .filter((e) => e.seasonNumber === row.seasonNumber)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  if (row.seriesId == null) return null;
  if (episodes.isLoading) return <Spinner className="h-4 w-4" />;
  return (
    <div className="flex flex-col gap-2">
      <select
        className="input w-auto"
        aria-label={t.manualImport.season}
        value={row.seasonNumber ?? ""}
        onChange={(e) => onChange({ seasonNumber: Number(e.target.value), episodeIds: [] })}
      >
        <option value="">{t.manualImport.season}…</option>
        {seasons.map((n) => (
          <option key={n} value={n}>
            {t.library.season(n)}
          </option>
        ))}
      </select>
      {row.seasonNumber != null && (
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {inSeason.map((e) => {
            const on = row.episodeIds.includes(e.id);
            return (
              <label
                key={e.id}
                className={`chip cursor-pointer ${on ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"}`}
                title={e.title}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  aria-label={`${t.manualImport.episodes} ${e.episodeNumber}`}
                  onChange={() => onChange({ episodeIds: on ? row.episodeIds.filter((x) => x !== e.id) : [...row.episodeIds, e.id] })}
                />
                E{String(e.episodeNumber).padStart(2, "0")}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Target({ service, row, onChange }: { service: ArrService; row: Row; onChange: (patch: Partial<Row>) => void }) {
  const series = useSeries();
  const movies = useMovies();
  if (service === "radarr") {
    const list = [...(movies.data ?? [])].sort((a, b) => a.title.localeCompare(b.title));
    return (
      <select
        className="input"
        aria-label={t.manualImport.movie}
        value={row.movieId ?? ""}
        onChange={(e) => onChange({ movieId: e.target.value ? Number(e.target.value) : undefined, selected: !!e.target.value })}
      >
        <option value="">{t.manualImport.choose}</option>
        {list.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title} ({m.year})
          </option>
        ))}
      </select>
    );
  }
  const list = [...(series.data ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="flex flex-col gap-2">
      <select
        className="input"
        aria-label={t.manualImport.series}
        value={row.seriesId ?? ""}
        onChange={(e) =>
          onChange({ seriesId: e.target.value ? Number(e.target.value) : undefined, seasonNumber: undefined, episodeIds: [] })
        }
      >
        <option value="">{t.manualImport.choose}</option>
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} ({s.year})
          </option>
        ))}
      </select>
      <EpisodePicker row={row} onChange={onChange} />
    </div>
  );
}

/** Importación manual como la de Sonarr/Radarr: elegir a qué serie/episodio o película corresponde cada archivo de una descarga. */
export function ManualImportDialog({
  service,
  downloadId,
  what,
  onClose,
}: {
  service: ArrService;
  downloadId: string | null;
  what: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const files = useQuery({
    queryKey: [service, "manualimport", downloadId],
    queryFn: () => getManualImport(service, downloadId!),
    enabled: downloadId !== null,
    staleTime: 0,
    retry: false,
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<ImportMode>("copy");
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows((files.data ?? []).map(initialRow)), [files.data]);

  const chosen = rows.filter((r) => r.selected);
  const complete = chosen.every((r) => targetOf(service, r) !== null);
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function submit() {
    setBusy(true);
    try {
      const cmd = await runManualImport(
        service,
        chosen.map((r) => ({ item: r.item, target: targetOf(service, r)! })),
        mode,
      );
      const id = toast.loading(t.manualImport.started);
      onClose();
      // Se sigue el comando en segundo plano para avisar de cómo acaba.
      if (cmd?.id != null) {
        waitForCommand(service, cmd.id)
          .then((c) => {
            if (commandSucceeded(c)) toast.success(t.manualImport.done, { id });
            else if (c.status === "queued" || c.status === "started") toast.message(t.manualImport.stillRunning, { id });
            else toast.error(t.manualImport.failed(c.message), { id });
          })
          .catch((e) => toast.error(t.manualImport.failed(errorMessage(e, service)), { id }))
          .finally(() => void qc.invalidateQueries({ queryKey: [service] }));
      } else {
        toast.success(t.manualImport.started, { id });
        void qc.invalidateQueries({ queryKey: [service] });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!downloadId) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.manualImport.title(what)} wide>
      {files.isLoading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted">
          <Spinner className="h-6 w-6" />
          {t.manualImport.loading}
        </div>
      ) : files.isError ? (
        <ErrorPanel service={service} error={files.error} onRetry={() => files.refetch()} compact />
      ) : !rows.length ? (
        <Empty>{t.manualImport.none}</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {rows.map((r, i) => (
              <div key={r.item.id ?? r.item.path} className="grid grid-cols-[auto_1fr_16rem] items-start gap-3 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={r.selected}
                  onChange={(e) => patch(i, { selected: e.target.checked })}
                  aria-label={`${t.manualImport.file} ${r.item.relativePath ?? r.item.name ?? r.item.path}`}
                />
                <div className="min-w-0">
                  <div className="break-all">{r.item.relativePath ?? r.item.name ?? r.item.path}</div>
                  <div className="mt-0.5 text-xs text-muted">{formatBytes(r.item.size)}</div>
                  {r.item.rejections?.map((x, k) => (
                    <div key={k} className="mt-1 flex items-start gap-1 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {rejectionText(x)}
                    </div>
                  ))}
                </div>
                <Target service={service} row={r} onChange={(p) => patch(i, p)} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              {t.manualImport.mode}
              <select
                className="input w-auto"
                value={mode}
                onChange={(e) => setMode(e.target.value as ImportMode)}
                aria-label={t.manualImport.mode}
              >
                <option value="copy">{t.manualImport.hardlink}</option>
                <option value="move">{t.manualImport.move}</option>
              </select>
            </label>
            <button className="btn-primary ml-auto" disabled={busy || !chosen.length || !complete} onClick={submit}>
              {busy && <Spinner className="h-4 w-4" />}
              {t.manualImport.submit(chosen.length)}
            </button>
          </div>
          <p className="text-xs text-muted">{!complete ? t.manualImport.incomplete : t.manualImport.hardlinkHint}</p>
        </div>
      )}
    </Dialog>
  );
}
