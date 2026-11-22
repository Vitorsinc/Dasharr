import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cloud } from "lucide-react";
import { googleLogin, googleLoginCancel, googleLoginPaste, googleLogout, syncDeleteRemote, syncPull, syncPush, syncSetPassword, type PushResult } from "@/api/google";
import { afterPull, googleStatusKey, syncedPrefs, useGoogleStatus, useSyncError } from "@/hooks/useGoogleSync";
import { ConfirmDialog } from "@/components/Dialog";
import { Loading } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { t } from "@/i18n/es";

type Choice = Extract<PushResult, { status: "remoteNewer" }>;

export function GoogleSync() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useGoogleStatus();
  const syncError = useSyncError();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [password, setPassword] = useState("");
  const [pasted, setPasted] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const linkingStarted = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: googleStatusKey });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  // Primera vez en este dispositivo: si no hay copia se sube la de aquí; si la hay, se pregunta cuál usar.
  async function link() {
    const res = await syncPush(syncedPrefs());
    if (res.status === "remoteNewer") setChoice(res);
    else toast.success(t.google.uploaded);
  }

  const needsLink = !!(status?.signedIn && status.hasPassword && !status.linked);
  useEffect(() => {
    if (!needsLink || linkingStarted.current) return;
    linkingStarted.current = true;
    void run(link);
  }, [needsLink]);

  if (isLoading) return <Loading />;
  if (!status?.available) return <p className="card p-4 text-sm text-muted">{t.google.unavailable}</p>;

  if (!status.signedIn) {
    return (
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-primary"
            disabled={waiting}
            onClick={async () => {
              setWaiting(true);
              try {
                await googleLogin();
                linkingStarted.current = false;
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setWaiting(false);
                await refresh();
              }
            }}
          >
            <Cloud className="h-4 w-4" /> {t.google.login}
          </button>
          {waiting && (
            <>
              <span className="text-sm text-muted">{t.google.waiting}</span>
              <button className="btn-outline" onClick={() => void googleLoginCancel()}>
                {t.google.cancel}
              </button>
            </>
          )}
        </div>
        {waiting && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              googleLoginPaste(pasted).then(
                () => setPasted(""),
                (err) => toast.error(errorMessage(err)),
              );
            }}
          >
            <span className="text-xs text-muted">{t.google.pasteHint}</span>
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                aria-label={t.google.pasteLabel}
                placeholder="http://127.0.0.1:…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button className="btn-primary" type="submit" disabled={!pasted.trim()}>
                {t.google.pasteSend}
              </button>
            </div>
          </form>
        )}
        <p className="text-xs text-muted">{t.google.loginHint}</p>
      </section>
    );
  }

  return (
    <section className="card divide-y divide-border">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm">{t.google.signedInAs(status.email ?? "")}</span>
        <button
          className="btn-outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await googleLogout();
              setChoice(null);
              linkingStarted.current = false;
              toast.success(t.google.logoutDone);
            })
          }
        >
          {t.google.logout}
        </button>
      </div>

      {!status.hasPassword ? (
        <form
          className="flex flex-col gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const pw = password;
            void run(async () => {
              await syncSetPassword(pw);
              setPassword("");
              linkingStarted.current = false;
            });
          }}
        >
          <span className="label">{t.google.password}</span>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="password"
              autoComplete="new-password"
              aria-label={t.google.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn-primary" type="submit" disabled={busy || password.length < 8}>
              {t.google.passwordSave}
            </button>
          </div>
          <span className="text-xs text-muted">{t.google.passwordHint}</span>
        </form>
      ) : choice ? (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-medium">{t.google.choiceTitle}</p>
            <p className="text-sm text-muted">
              {t.google.choiceText(choice.device, choice.updatedAt ? formatDateTime(new Date(choice.updatedAt)) : "—")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await afterPull(qc, await syncPull(true));
                  setChoice(null);
                })
              }
            >
              {t.google.useRemote}
            </button>
            <button
              className="btn-outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await syncPush(syncedPrefs(), true);
                  setChoice(null);
                  toast.success(t.google.uploaded);
                })
              }
            >
              {t.google.useLocal}
            </button>
          </div>
        </div>
      ) : !status.linked ? (
        <p className="p-4 text-sm text-muted">{t.google.linking}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm">
              {status.lastSync ? t.google.synced(formatDateTime(new Date(status.lastSync))) : t.google.neverSynced}
            </span>
            {syncError && <span className="text-xs text-danger">{syncError}</span>}
          </div>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const pulled = await syncPull();
                await afterPull(qc, pulled);
                let pushed = await syncPush(syncedPrefs());
                if (pushed.status === "remoteNewer") {
                  await afterPull(qc, await syncPull());
                  pushed = { status: "unchanged" };
                }
                if (pushed.status === "uploaded") toast.success(t.google.uploaded);
                else if (pulled.status !== "applied") toast.success(t.google.upToDate);
              })
            }
          >
            {t.google.syncNow}
          </button>
        </div>
      )}

      {status.hasPassword && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-xs text-muted">{t.google.deleteRemoteHint}</span>
          <button className="btn-outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
            {t.google.deleteRemote}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.google.deleteRemote}
        message={t.google.deleteConfirm}
        onConfirm={() =>
          run(async () => {
            await syncDeleteRemote();
            setChoice(null);
            linkingStarted.current = false;
            toast.success(t.google.deleted);
          })
        }
      />
    </section>
  );
}
