import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Loading } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";

export interface RenameRow {
  /** Id del archivo (episodio o película). */
  fileId: number;
  existingPath: string;
  newPath: string;
}

/** Vista previa del *arr de los archivos que cambian de nombre, y confirmación para renombrarlos. */
export function RenameDialog({
  service,
  title,
  queryKey,
  load,
  onRename,
  onClose,
}: {
  service: ArrService;
  title: string;
  queryKey: unknown[];
  load: () => Promise<RenameRow[]>;
  onRename: (fileIds: number[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [service, "rename", ...queryKey], queryFn: load, staleTime: 0 });
  const list = q.data ?? [];
  async function rename() {
    try {
      await onRename(list.map((r) => r.fileId));
      toast.success(t.seriesTools.renameStarted);
      onClose();
      await qc.invalidateQueries({ queryKey: [service] });
    } catch (e) {
      toast.error(errorMessage(e, service));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <p className="text-sm text-muted">{t.seriesTools.renameNone}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t.seriesTools.renameCount(list.length)}</p>
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={`${r.fileId}-${r.newPath}`} className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">
                <div className="break-all text-muted">{r.existingPath}</div>
                <ArrowDown className="my-0.5 h-3 w-3 text-muted" aria-hidden />
                <div className="break-all">{r.newPath}</div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              {t.common.cancel}
            </button>
            <button className="btn-primary" onClick={rename}>
              {t.seriesTools.renameAction(list.length)}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
