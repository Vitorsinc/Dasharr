import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Cpu, Library, Palette, ScrollText, Server, Upload, type LucideIcon } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Page } from "@/components/Page";
import { Loading, Segmented, Toggle } from "@/components/ui";
import { t } from "@/i18n/es";
import { SERVICE_KINDS } from "@/lib/types";
import { useSettings } from "@/hooks/useSettings";
import { useConnectionStates } from "@/hooks/useConnectionStates";
import { faClearQueue } from "@/api/filmaffinity";
import { RATING_SOURCES, usePrefs, type RatingSource, type Theme } from "@/hooks/usePrefs";
import { ServiceForm } from "./ServiceForm";
import { parseConfigFile } from "@/lib/importConfig";
import { openExternal, saveService } from "@/lib/tauri";
import { tmdbSaveKey } from "@/api/tmdb";
import { useTmdbHasKey } from "@/hooks/useMovieReleases";
import { COUNTRIES } from "@/lib/countries";
import { runUpdateCheck, startUpdate, useUpdateState } from "@/hooks/useUpdates";
import { versionLabel } from "@/lib/version";
import { errorMessage } from "@/lib/errors";
import { settingsKey } from "@/hooks/useSettings";
import { useRadarrMeta, useSonarrMeta } from "@/hooks/useArr";
import { defaultsFor, movieDefaultsFor, type SeriesKind } from "@/lib/anime";
import { LogsPanel } from "@/pages/Logs";
import { cn } from "@/lib/cn";

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function ImportButton({ onImported }: { onImported: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  async function onFile(file: File) {
    try {
      const services = parseConfigFile(await readText(file));
      for (const s of services) await saveService(s.service, s.config, s.secrets);
      await qc.invalidateQueries();
      await qc.refetchQueries({ queryKey: settingsKey });
      onImported();
      toast.success(t.settings.imported(services.length), { description: t.settings.importHint });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={t.settings.import}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button className="btn-outline" onClick={() => input.current?.click()}>
        <Upload className="h-4 w-4" /> {t.settings.import}
      </button>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Appearance() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <section className="card divide-y divide-border">
      <Row label={t.settings.theme}>
        <Segmented<Theme>
          label={t.settings.theme}
          value={prefs.theme}
          onChange={(theme) => setPrefs({ theme })}
          options={[
            { value: "dark", label: t.settings.themeDark },
            { value: "light", label: t.settings.themeLight },
            { value: "system", label: t.settings.themeSystem },
          ]}
        />
      </Row>
    </section>
  );
}

function Notifications() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <section className="card divide-y divide-border">
      <Row label={t.settings.notifications}>
        <Toggle label={t.settings.notifications} checked={prefs.notifications} onChange={(notifications) => setPrefs({ notifications })} />
      </Row>
      <Row label={t.settings.plexNotifications}>
        <Toggle
          label={t.settings.plexNotifications}
          checked={prefs.plexNotifications}
          onChange={(plexNotifications) => setPrefs({ plexNotifications })}
        />
      </Row>
    </section>
  );
}

function Autostart() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    isEnabled().then(setAutostart, () => setAutostart(null));
  }, []);
  const toggleAutostart = async (v: boolean) => {
    try {
      await (v ? enable() : disable());
      setAutostart(v);
    } catch {
      /* no disponible fuera de la app de escritorio */
    }
  };
  if (autostart === null) return null;
  return (
    <section className="card">
      <Row label={t.settings.autostart}>
        <Toggle label={t.settings.autostart} checked={autostart} onChange={toggleAutostart} />
      </Row>
    </section>
  );
}

function RatingsSettings() {
  const [prefs, setPrefs] = usePrefs();
  const label = (s: RatingSource) => (s === "filmaffinity" ? t.filmaffinity.label : t.arrRatings[s]);
  const toggle = (s: RatingSource, show: boolean) => {
    setPrefs({ hiddenRatings: show ? prefs.hiddenRatings.filter((h) => h !== s) : [...prefs.hiddenRatings, s] });
    if (s === "filmaffinity" && !show) faClearQueue().catch(() => {});
  };
  return (
    <section className="card grid divide-border sm:grid-cols-2" aria-label={t.settings.ratings}>
      {RATING_SOURCES.map((s) => (
        <div key={s} className="flex items-center justify-between gap-4 p-4">
          <span className="text-sm">{label(s)}</span>
          <Toggle label={label(s)} checked={!prefs.hiddenRatings.includes(s)} onChange={(v) => toggle(s, v)} />
        </div>
      ))}
    </section>
  );
}

function MovieDefaults() {
  const meta = useRadarrMeta();
  const [prefs, setPrefs] = usePrefs();
  const roots = meta.roots.data ?? [];
  const profiles = meta.profiles.data ?? [];
  if (meta.roots.configured === false)
    return <section className="card p-4 text-sm text-muted">{t.settings.movieDefaultsNeedRadarr}</section>;
  if (meta.roots.isLoading || meta.profiles.isLoading) return <Loading />;
  if (!roots.length || !profiles.length) return null;
  const d = movieDefaultsFor(roots, profiles, prefs.movieDefaults);
  const set = (patch: { rootFolderPath?: string; qualityProfileId?: number }) => setPrefs({ movieDefaults: { ...d, ...patch } });
  const name = t.nav.movies;
  return (
    <section className="card divide-y divide-border" aria-label={t.settings.movieDefaults}>
      <div className="flex flex-wrap items-center gap-4 p-4">
        <span className="w-20 text-sm font-medium">{name}</span>
        <label className="flex-1">
          <span className="label">{t.library.rootFolder}</span>
          <select className="input" aria-label={`${t.library.rootFolder} ${name}`} value={d.rootFolderPath} onChange={(e) => set({ rootFolderPath: e.target.value })}>
            {roots.map((r) => (
              <option key={r.id} value={r.path}>
                {r.path}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="label">{t.library.qualityProfile}</span>
          <select className="input" aria-label={`${t.library.qualityProfile} ${name}`} value={d.qualityProfileId} onChange={(e) => set({ qualityProfileId: Number(e.target.value) })}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function SeriesDefaults() {
  const meta = useSonarrMeta();
  const [prefs, setPrefs] = usePrefs();
  const roots = meta.roots.data ?? [];
  const profiles = meta.profiles.data ?? [];
  if (meta.roots.configured === false)
    return <section className="card p-4 text-sm text-muted">{t.settings.seriesDefaultsNeedSonarr}</section>;
  if (meta.roots.isLoading || meta.profiles.isLoading) return <Loading />;
  if (!roots.length || !profiles.length) return null;
  const set = (kind: SeriesKind, patch: { rootFolderPath?: string; qualityProfileId?: number }) =>
    setPrefs({
      seriesDefaults: {
        ...prefs.seriesDefaults,
        [kind]: { ...defaultsFor(kind, roots, profiles, prefs.seriesDefaults[kind]), ...patch },
      },
    });
  return (
    <section className="card divide-y divide-border" aria-label={t.settings.seriesDefaults}>
      {(["series", "anime"] as const).map((kind) => {
        const d = defaultsFor(kind, roots, profiles, prefs.seriesDefaults[kind]);
        const name = kind === "anime" ? t.nav.anime : t.nav.series;
        return (
          <div key={kind} className="flex flex-wrap items-center gap-4 p-4">
            <span className="w-20 text-sm font-medium">{name}</span>
            <label className="flex-1">
              <span className="label">{t.library.rootFolder}</span>
              <select
                className="input"
                aria-label={`${t.library.rootFolder} ${name}`}
                value={d.rootFolderPath}
                onChange={(e) => set(kind, { rootFolderPath: e.target.value })}
              >
                {roots.map((r) => (
                  <option key={r.id} value={r.path}>
                    {r.path}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="label">{t.library.qualityProfile}</span>
              <select
                className="input"
                aria-label={`${t.library.qualityProfile} ${name}`}
                value={d.qualityProfileId}
                onChange={(e) => set(kind, { qualityProfileId: Number(e.target.value) })}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
    </section>
  );
}

function MovieReleasesSettings() {
  const qc = useQueryClient();
  const [prefs, setPrefs] = usePrefs();
  const hasKey = useTmdbHasKey().data === true;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(value: string) {
    setBusy(true);
    try {
      await tmdbSaveKey(value);
      setKey("");
      await qc.invalidateQueries({ queryKey: ["tmdb"] });
      toast.success(value ? t.premieres.tmdbSaved : t.premieres.tmdbRemoved);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card divide-y divide-border" aria-label={t.premieres.title}>
      <label className="flex flex-wrap items-center justify-between gap-4 p-4">
        <span>
          <span className="block text-sm">{t.premieres.country}</span>
          <span className="block text-xs text-muted">{t.premieres.countryHint}</span>
        </span>
        <select className="input w-56" value={prefs.releaseCountry} onChange={(e) => setPrefs({ releaseCountry: e.target.value })}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="flex flex-col gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) save(key.trim());
        }}
      >
        <span className="label">{t.premieres.tmdbKey}</span>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="password"
            aria-label={t.premieres.tmdbKey}
            placeholder={hasKey ? t.settings.savedSecret : ""}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="btn-primary" type="submit" disabled={busy || !key.trim()}>
            {t.premieres.save}
          </button>
          {hasKey && (
            <button className="btn-outline" type="button" disabled={busy} onClick={() => save("")}>
              {t.premieres.tmdbRemove}
            </button>
          )}
        </div>
        <span className="text-xs text-muted">
          {t.premieres.tmdbKeyHint}{" "}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => openExternal("https://www.themoviedb.org/settings/api")}
          >
            {t.premieres.tmdbGetKey}
          </button>
        </span>
      </form>
    </section>
  );
}

function Updates() {
  const [prefs, setPrefs] = usePrefs();
  const { available, checking, installing, upToDate } = useUpdateState();
  return (
    <section className="card divide-y divide-border" aria-label={t.updates.title}>
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="text-sm">
          Dasharr {versionLabel()}
          {upToDate && <span className="ml-3 text-muted">{t.updates.upToDate}</span>}
        </div>
        <button className="btn-outline" onClick={() => void runUpdateCheck({ manual: true })} disabled={checking || installing}>
          {checking ? t.updates.checking : t.updates.check}
        </button>
      </div>
      {available && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-accent">{t.updates.newVersion(available.version)}</span>
            <button className="btn-primary" onClick={() => void startUpdate(available)} disabled={installing}>
              {installing ? t.updates.installing(available.version) : t.updates.installNow}
            </button>
          </div>
          {available.notes.trim() && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-fg">{t.updates.notes}</summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-muted">{available.notes.trim()}</pre>
            </details>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm">{t.updates.auto}</span>
          <span className="text-xs text-muted">{t.updates.autoHint}</span>
        </div>
        <Toggle label={t.updates.auto} checked={prefs.autoUpdate} onChange={(v) => setPrefs({ autoUpdate: v })} />
      </div>
    </section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Services() {
  const { data, isLoading } = useSettings();
  const { data: routes } = useConnectionStates();
  const [generation, setGeneration] = useState(0);
  return (
    <Section title={t.settings.servicesTitle} hint={t.settings.autoSwitch}>
      <div>
        <ImportButton onImported={() => setGeneration((g) => g + 1)} />
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        SERVICE_KINDS.map((s) => <ServiceForm key={`${s}-${generation}`} service={s} view={data?.[s]} route={routes?.[s]} />)
      )}
    </Section>
  );
}

const tabs: { id: string; label: string; icon: LucideIcon; wide?: boolean; render: () => ReactNode }[] = [
  { id: "servicios", label: t.settings.tabs.services, icon: Server, render: () => <Services /> },
  {
    id: "contenido",
    label: t.settings.tabs.content,
    icon: Library,
    render: () => (
      <div className="flex flex-col gap-8">
        <Section title={t.settings.seriesDefaults} hint={t.settings.seriesDefaultsHint}>
          <SeriesDefaults />
        </Section>
        <Section title={t.settings.movieDefaults} hint={t.settings.movieDefaultsHint}>
          <MovieDefaults />
        </Section>
        <Section title={t.settings.ratings} hint={t.settings.ratingsHint}>
          <RatingsSettings />
        </Section>
        <Section title={t.premieres.title}>
          <MovieReleasesSettings />
        </Section>
      </div>
    ),
  },
  {
    id: "aspecto",
    label: t.settings.tabs.appearance,
    icon: Palette,
    render: () => (
      <Section title={t.settings.tabs.appearance}>
        <Appearance />
      </Section>
    ),
  },
  {
    id: "notificaciones",
    label: t.settings.tabs.notifications,
    icon: Bell,
    render: () => (
      <Section title={t.settings.tabs.notifications}>
        <Notifications />
      </Section>
    ),
  },
  {
    id: "sistema",
    label: t.settings.tabs.system,
    icon: Cpu,
    render: () => (
      <Section title={t.settings.tabs.system}>
        <Autostart />
        <Updates />
      </Section>
    ),
  },
  { id: "registro", label: t.nav.logs, icon: ScrollText, wide: true, render: () => <LogsPanel /> },
];

export default function SettingsPage() {
  const { tab = tabs[0].id } = useParams();
  const current = tabs.find((x) => x.id === tab);
  if (!current) return <Navigate to="/ajustes" replace />;
  return (
    <Page title={t.nav.settings}>
      <nav className="-mt-2 flex flex-wrap gap-1 border-b border-border" aria-label={t.settings.tabs.label}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            to={id === tabs[0].id ? "/ajustes" : `/ajustes/${id}`}
            aria-current={id === current.id ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              id === current.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <div className={cn("flex flex-col gap-4", !current.wide && "max-w-4xl")}>{current.render()}</div>
    </Page>
  );
}
