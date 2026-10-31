import { useState } from "react";
import { FolderPlus, HardDrive, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading } from "@/components/ui";
import type { ArrService } from "@/api/arr";
import { arrManage, type RootFolderFull } from "@/api/arrManage";
import { useRootFolders, useRun } from "@/hooks/useArrManage";
import { t } from "@/i18n/es";
import { formatBytes } from "@/lib/format";

export function RootFolders({ service }: { service: ArrService }) {
  const api = arrManage(service);
  const q = useRootFolders(service);
  const run = useRun(service);
  const [path, setPath] = useState("");
  const [deleting, setDeleting] = useState<RootFolderFull | null>(null);
  // Cambian las carpetas y el espacio libre del indicador de disco.
  const keys = [
    [service, "roots"],
    [service, "diskspace"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.manage.roots.hint}</p>
      <form
        className="flex flex-col gap-1"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = path.trim();
          if (p && (await run(() => api.addRootFolder(p), t.manage.roots.added, keys))) setPath("");
        }}
      >
        <span className="label">{t.manage.roots.path}</span>
        <div className="flex gap-2">
          <input
            className="input max-w-md font-mono"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label={t.manage.roots.path}
          />
          <button type="submit" className="btn-primary" disabled={!path.trim()}>
            <FolderPlus className="h-4 w-4" aria-hidden /> {t.manage.roots.add}
          </button>
        </div>
        <span className="text-xs text-muted">{t.manage.roots.pathHint}</span>
      </form>
      {q.isLoading || q.configured === undefined ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service={service} error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Empty>{t.manage.roots.empty}</Empty>
      ) : (
        <ul className="card divide-y divide-border" aria-label={t.manage.tabs.roots}>
          {q.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <HardDrive className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono" title={r.path}>
                  {r.path}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {r.accessible === false ? (
                    <span className="text-danger">{t.manage.roots.inaccessible}</span>
                  ) : (
                    r.freeSpace != null && <span>{t.manage.roots.free(formatBytes(r.freeSpace))}</span>
                  )}
                  {!!r.unmappedFolders?.length && <span>{t.manage.roots.unmapped(r.unmappedFolders.length)}</span>}
                </div>
              </div>
              <button
                className="btn-ghost p-1.5 text-muted hover:text-danger"
                aria-label={`${t.manage.roots.remove}: ${r.path}`}
                title={t.manage.roots.remove}
                onClick={() => setDeleting(r)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.manage.roots.deleteTitle}
        message={deleting ? t.manage.roots.deleteMessage(deleting.path) : ""}
        confirmLabel={t.manage.roots.remove}
        onConfirm={() => deleting && run(() => api.deleteRootFolder(deleting.id), t.manage.roots.deleted, keys)}
      />
    </div>
  );
}
