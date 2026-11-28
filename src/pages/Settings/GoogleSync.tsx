import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cloud } from "lucide-react";
import { googleLoginCancel, googleLoginPaste, googleLogout, syncPull, syncPush } from "@/api/google";
import { afterPull, googleStatusKey, linkDevice, signInAndLink, syncedPrefs, useGoogleStatus, useSyncError } from "@/hooks/useGoogleSync";
import { Loading } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { isMobile } from "@/lib/platform";
import { t } from "@/i18n/es";

/** Botón de inicio de sesión con Google. En el PC se abre el navegador; en Android, la hoja de cuentas. */
export function GoogleSignInButton({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [pasted, setPasted] = useState("");
  const browser = !isMobile();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={waiting}
          onClick={async () => {
            setWaiting(true);
            try {
              await signInAndLink(qc);
              onDone?.();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setWaiting(false);
              await qc.invalidateQueries({ queryKey: googleStatusKey });
            }
          }}
        >
          <Cloud className="h-4 w-4" /> {waiting && !browser ? t.google.signingIn : t.google.login}
        </button>
        {waiting && browser && (
          <>
            <span className="text-sm text-muted">{t.google.waiting}</span>
            <button className="btn-outline" onClick={() => void googleLoginCancel()}>
              {t.google.cancel}
            </button>
          </>
        )}
      </div>
      {waiting && browser && (
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
    </div>
  );
}

export function GoogleSync() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useGoogleStatus();
  const syncError = useSyncError();
  const [busy, setBusy] = useState(false);
  const linking = useRef(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: googleStatusKey });
    }
  }

  // Sesión iniciada pero sin sincronizar nunca (por ejemplo, si se cerró la app a medias): se termina aquí.
  const needsLink = !!(status?.signedIn && !status.linked);
  useEffect(() => {
    if (!needsLink || linking.current) return;
    linking.current = true;
    void run(async () => {
      await linkDevice(qc);
    }).finally(() => (linking.current = false));
  }, [needsLink]);

  if (isLoading) return <Loading />;
  if (!status?.available) return <p className="card p-4 text-sm text-muted">{t.google.unavailable}</p>;

  if (!status.signedIn) {
    return (
      <section className="card flex flex-col gap-3 p-4">
        <GoogleSignInButton />
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
              toast.success(t.google.logoutDone);
            })
          }
        >
          {t.google.logout}
        </button>
      </div>
      {!status.linked ? (
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
                else if (pushed.status === "nothingToUpload" && pulled.status !== "applied") toast.info(t.google.nothingSaved);
                else if (pulled.status !== "applied") toast.success(t.google.upToDate);
              })
            }
          >
            {t.google.syncNow}
          </button>
        </div>
      )}
    </section>
  );
}
