import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ConfirmDialog } from "@/components/Dialog";
import { Empty, Loading, Segmented } from "@/components/ui";
import { t } from "@/i18n/es";
import { clearLog, readLog } from "@/lib/tauri";
import { parseLog, type LogLevel } from "@/lib/logs";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";

type Filter = "all" | "errors" | "warnings";

const levelStyle: Record<LogLevel, string> = {
  ERROR: "bg-danger/15 text-danger",
  WARN: "bg-warning/15 text-warning",
  INFO: "bg-accent/15 text-accent",
  DEBUG: "bg-surface-2 text-muted",
  TRACE: "bg-surface-2 text-muted",
};

export default function LogsPage() {
  const log = useQuery({ queryKey: ["logs"], queryFn: readLog, refetchInterval: 5000 });
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const entries = useMemo(() => {
    const q = text.trim().toLowerCase();
    return parseLog(log.data?.lines ?? [])
      .filter((e) => filter === "all" || e.level === "ERROR" || (filter === "warnings" && e.level === "WARN"))
      .filter((e) => !q || `${e.source} ${e.message}`.toLowerCase().includes(q))
      .reverse();
  }, [log.data, filter, text]);

  async function copy() {
    try {
      await navigator.clipboard.writeText((log.data?.lines ?? []).join("\n"));
      toast.success(t.logs.copied);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function clear() {
    try {
      await clearLog();
      toast.success(t.logs.cleared);
      await log.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Page
      title={t.logs.title}
      actions={
        <>
          <button className="btn-ghost" onClick={() => log.refetch()}>
            <RefreshCw className="h-4 w-4" /> {t.logs.refresh}
          </button>
          <button className="btn-ghost" onClick={copy}>
            <Copy className="h-4 w-4" /> {t.logs.copy}
          </button>
          <button className="btn-ghost text-danger" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> {t.logs.clear}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">{t.logs.hint}</p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t.logs.all },
            { value: "errors", label: t.logs.errors },
            { value: "warnings", label: t.logs.warnings },
          ]}
        />
        <input
          className="input max-w-xs"
          placeholder={t.logs.filter}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.logs.filter}
        />
      </div>
      {log.isLoading ? (
        <Loading />
      ) : !entries.length ? (
        <Empty>{t.logs.empty}</Empty>
      ) : (
        <div className="card divide-y divide-border font-mono text-xs">
          {entries.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2">
              <span className="shrink-0 tabular-nums text-muted">
                {e.date.slice(5)} {e.time}
              </span>
              <span className={cn("chip w-14 shrink-0 justify-center", levelStyle[e.level] ?? levelStyle.INFO)}>{e.level}</span>
              <span className="w-20 shrink-0 text-muted">{e.source}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{e.message}</span>
            </div>
          ))}
        </div>
      )}
      {log.data?.path && <p className="mt-3 break-all text-xs text-muted">{t.logs.file(log.data.path)}</p>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.logs.clear}
        message={t.logs.confirmClear}
        confirmLabel={t.logs.clear}
        onConfirm={clear}
      />
    </Page>
  );
}
