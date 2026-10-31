import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, LogIn, Server, XCircle } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/i18n/es";
import { openExternal, plexLoginCheck, plexLoginFinish, plexLoginStart, saveService, testService, type PlexServerChoice } from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";
import type { Route, SecretsPatch, ServiceConfig, ServiceKind, ServiceSettingsView } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/ui";
import { settingsKey } from "@/hooks/useSettings";
import { connectionKey } from "@/hooks/useConnectionStates";

const defaultPorts: Record<ServiceKind, number> = {
  radarr: 7878,
  sonarr: 8989,
  prowlarr: 9696,
  bazarr: 6767,
  qbittorrent: 8080,
  tracearr: 3000,
  plex: 32400,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

type Result = { ok: true; version: string } | { ok: false; message: string } | null;

const PLEX_POLL_MS = 2_000;
const PLEX_LOGIN_TIMEOUT_MS = 5 * 60_000;

/** Inicio de sesión con PIN: abre la web de Plex, espera a que el usuario acepte y deja elegir el servidor. */
function PlexLogin({ onDone }: { onDone: (server: PlexServerChoice) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "waiting" | "pick">("idle");
  const [servers, setServers] = useState<PlexServerChoice[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(timer.current), []);

  async function start() {
    clearInterval(timer.current);
    try {
      const { pinId, url } = await plexLoginStart();
      setState("waiting");
      await openExternal(url);
      const deadline = Date.now() + PLEX_LOGIN_TIMEOUT_MS;
      timer.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(timer.current);
          setState("idle");
          return toast.error(t.settings.plexTimeout);
        }
        try {
          const found = await plexLoginCheck(pinId);
          if (!found) return;
          clearInterval(timer.current);
          setServers(found);
          setState("pick");
        } catch (e) {
          clearInterval(timer.current);
          setState("idle");
          toast.error(errorMessage(e));
        }
      }, PLEX_POLL_MS);
    } catch (e) {
      setState("idle");
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={start} disabled={state === "waiting"}>
          {state === "waiting" ? <Spinner className="h-4 w-4 text-current" /> : <LogIn className="h-4 w-4" />}
          {t.settings.plexLogin}
        </button>
        {state === "waiting" && <span className="text-sm text-muted">{t.settings.plexWaiting}</span>}
      </div>
      {state === "pick" && (
        <div className="flex flex-col gap-2">
          <span className="label">{servers.length ? t.settings.plexPickServer : t.settings.plexNoServers}</span>
          {servers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Server className="h-4 w-4 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {s.name}
                  {!s.owned && <span className="ml-2 text-xs text-muted">({t.settings.plexShared})</span>}
                </div>
                <div className="truncate text-xs text-muted">{[s.localUrl, s.externalUrl].filter(Boolean).join(" · ")}</div>
              </div>
              <button className="btn-outline" onClick={() => onDone(s).then(() => setState("idle"))}>
                {t.settings.plexUse}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ServiceForm({ service, view, route }: { service: ServiceKind; view?: ServiceSettingsView; route?: Route | null }) {
  const qc = useQueryClient();
  const isQbit = service === "qbittorrent";
  const isTracearr = service === "tracearr";
  const isPlex = service === "plex";
  const [localUrl, setLocalUrl] = useState(view?.config.localUrl ?? "");
  const [externalUrl, setExternalUrl] = useState(view?.config.externalUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState(view?.username ?? "");
  const [password, setPassword] = useState("");
  const [proxyUsername, setProxyUsername] = useState(view?.proxyUsername ?? "");
  const [proxyPassword, setProxyPassword] = useState("");
  const [showProxy, setShowProxy] = useState(!!view?.proxyUsername);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<Result>(null);

  const config: ServiceConfig = { localUrl: localUrl.trim() || null, externalUrl: externalUrl.trim() || null, enabled: true };
  const patch = (): SecretsPatch => ({
    apiKey: apiKey || undefined,
    username: isQbit ? username.trim() : undefined,
    password: isQbit ? password || undefined : undefined,
    proxyUsername: isTracearr ? undefined : proxyUsername.trim(),
    proxyPassword: proxyPassword || undefined,
  });
  const hasUrl = !!(config.localUrl || config.externalUrl);
  const configured = !!(view?.config.localUrl || view?.config.externalUrl);

  async function onTest() {
    if (!hasUrl) return setResult({ ok: false, message: t.settings.needUrl });
    setBusy("test");
    setResult(null);
    try {
      setResult({ ok: true, version: await testService(service, config, patch()) });
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e, service) });
    } finally {
      setBusy(null);
    }
  }

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: settingsKey });
    await qc.invalidateQueries({ queryKey: connectionKey });
    await qc.invalidateQueries({ queryKey: [service] });
  }

  /** Usa las direcciones que conoce Plex, salvo las que el usuario ya haya escrito. */
  async function onPlexServer(server: PlexServerChoice) {
    const next = { localUrl: config.localUrl ?? server.localUrl, externalUrl: config.externalUrl ?? server.externalUrl, enabled: true };
    try {
      await plexLoginFinish(server.id, next);
      setLocalUrl(next.localUrl ?? "");
      setExternalUrl(next.externalUrl ?? "");
      setApiKey("");
      await invalidate();
      toast.success(t.settings.plexLoggedIn(server.name));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onSave() {
    if (!hasUrl) return setResult({ ok: false, message: t.settings.needUrl });
    setBusy("save");
    try {
      await saveService(service, config, patch());
      setApiKey("");
      setPassword("");
      setProxyPassword("");
      await invalidate();
      toast.success(t.settings.saved(t.services[service]));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const port = defaultPorts[service];
  return (
    <section className="card p-5" aria-label={t.services[service]}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t.services[service]}</h2>
        {configured && <StatusBadge route={route} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.settings.localUrl}>
          <input
            className="input"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder={`http://192.168.1.50:${port}`}
          />
        </Field>
        <Field label={t.settings.externalUrl}>
          <input
            className="input"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder={`https://${service}.midominio.com`}
          />
        </Field>
        {isQbit ? (
          <>
            <Field label={t.settings.username}>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.settings.password}>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={view?.hasPassword ? t.settings.savedSecret : ""}
              />
            </Field>
            <Field label={t.settings.qbitApiKey} hint={t.settings.qbitApiKeyHint}>
              <input
                className="input font-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={view?.hasApiKey ? t.settings.savedSecret : ""}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </>
        ) : (
          <Field
            label={isPlex ? t.settings.plexToken : t.settings.apiKey}
            hint={isPlex ? t.settings.plexTokenHint : isTracearr ? t.settings.tracearrApiKeyHint : t.settings.apiKeyHint}
          >
            <input
              className="input font-mono"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={view?.hasApiKey ? t.settings.savedSecret : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
      </div>
      {isPlex && <PlexLogin onDone={onPlexServer} />}

      {isTracearr ? (
        <p className="mt-4 text-xs text-muted">{t.settings.tracearrNoProxy}</p>
      ) : (
        <button
          type="button"
          className="mt-4 flex items-center gap-1 text-sm text-muted hover:text-fg"
          onClick={() => setShowProxy((v) => !v)}
          aria-expanded={showProxy}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showProxy ? "rotate-180" : ""}`} />
          {t.settings.proxy}
        </button>
      )}
      {showProxy && !isTracearr && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Field label={t.settings.proxyUsername}>
            <input className="input" value={proxyUsername} onChange={(e) => setProxyUsername(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t.settings.proxyPassword}>
            <input
              className="input"
              type="password"
              value={proxyPassword}
              onChange={(e) => setProxyPassword(e.target.value)}
              placeholder={view?.hasProxyPassword ? t.settings.savedSecret : ""}
            />
          </Field>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn-outline" onClick={onTest} disabled={busy !== null}>
          {busy === "test" && <Spinner className="h-4 w-4" />}
          {busy === "test" ? t.settings.testing : t.settings.test}
        </button>
        <button className="btn-primary" onClick={onSave} disabled={busy !== null}>
          {busy === "save" && <Spinner className="h-4 w-4 text-current" />}
          {t.common.save}
        </button>
        {result && (
          <span role="status" className={`flex items-center gap-1.5 text-sm ${result.ok ? "text-success" : "text-danger"}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.ok ? t.settings.connected(result.version) : result.message}
          </span>
        )}
      </div>
    </section>
  );
}
