import { useState } from "react";
import { CheckCircle2, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Pager, Segmented, Spinner } from "@/components/ui";
import { SeerrAvatar } from "@/components/seerr/RequestRow";
import { IssueStatus, seerr, titleOf, tmdbImage, userName, type Issue, type IssueFilter } from "@/api/seerr";
import { SEERR_PAGE, useSeerrIssues, useSeerrMedia, useSeerrRun } from "@/hooks/useSeerr";
import { t } from "@/i18n/es";
import { cn } from "@/lib/cn";
import { formatAge, formatDateTime } from "@/lib/format";

function IssueRow({ issue }: { issue: Issue }) {
  const run = useSeerrRun();
  const type = issue.media?.mediaType ?? "movie";
  const details = useSeerrMedia(type, issue.media?.tmdbId);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = details.data ? titleOf(details.data) : `TMDB ${issue.media?.tmdbId ?? "?"}`;
  const poster = tmdbImage(details.data?.posterPath, "w185");
  const comments = issue.comments ?? [];
  const resolved = issue.status === IssueStatus.Resolved;
  const where = t.seerr.issueWhere(issue.problemSeason, issue.problemEpisode);

  async function send() {
    if (!comment.trim()) return;
    setBusy(true);
    if (await run(() => seerr.commentIssue(issue.id, comment.trim()), t.seerr.commented)) setComment("");
    setBusy(false);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {poster && <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="chip bg-surface-2 text-muted">{t.seerr.issueType[issue.issueType] ?? issue.issueType}</span>
            <span className={cn("chip", resolved ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
              {t.seerr.issueStatus[issue.status]}
            </span>
            {where && <span>{where}</span>}
          </div>
          {comments[0] && <p className="mt-1 line-clamp-2 text-sm text-muted">{comments[0].message}</p>}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <SeerrAvatar user={issue.createdBy} className="h-4 w-4 text-[9px]" />
            <span>
              {userName(issue.createdBy)} · {formatAge(issue.createdAt)}
            </span>
            <button className="ml-2 flex items-center gap-1 text-accent hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {t.seerr.comments(comments.length)}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {resolved ? (
            <button className="btn-outline px-2.5 py-1.5" onClick={() => run(() => seerr.setIssueStatus(issue.id, "open"), t.seerr.reopened)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {t.seerr.reopen}
            </button>
          ) : (
            <button className="btn-primary px-2.5 py-1.5" onClick={() => run(() => seerr.setIssueStatus(issue.id, "resolved"), t.seerr.resolved)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {t.seerr.resolve}
            </button>
          )}
          <button
            className="btn-ghost p-1.5 text-muted hover:text-danger"
            title={t.common.delete}
            aria-label={`${t.common.delete}: ${title}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {open && (
        <div className="ml-16 mt-3 flex flex-col gap-2">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <SeerrAvatar user={c.user} />
              <div className="min-w-0">
                <div className="text-xs text-muted">
                  <span className="font-medium text-fg">{userName(c.user)}</span> · {formatDateTime(c.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{c.message}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              className="input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={t.seerr.commentPlaceholder}
              aria-label={t.seerr.commentPlaceholder}
            />
            <button className="btn-outline" disabled={busy || !comment.trim()} onClick={send}>
              {busy ? <Spinner className="h-4 w-4" /> : null} {t.seerr.comment}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t.seerr.deleteIssueTitle}
        message={t.seerr.deleteIssueMessage}
        onConfirm={() => run(() => seerr.deleteIssue(issue.id), t.seerr.issueDeleted)}
      />
    </div>
  );
}

export function SeerrIssues() {
  const [filter, setFilter] = useState<IssueFilter>("open");
  const [page, setPage] = useState(1);
  const q = useSeerrIssues(filter, page);
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        options={(["open", "resolved", "all"] as const).map((v) => ({ value: v, label: t.seerr.issueFilters[v] }))}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorPanel service="seerr" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <div className="card">
          <Empty>{t.seerr.issuesEmpty}</Empty>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-border">
            {q.data.results.map((i) => (
              <IssueRow key={i.id} issue={i} />
            ))}
          </div>
          <Pager page={page} pageSize={SEERR_PAGE} total={q.data.pageInfo.results} onPage={setPage} />
        </>
      )}
    </div>
  );
}
