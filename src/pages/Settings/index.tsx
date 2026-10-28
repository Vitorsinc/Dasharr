import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Page } from "@/components/Page";
import { Loading, Segmented, Toggle } from "@/components/ui";
import { t } from "@/i18n/es";
import { SERVICE_KINDS } from "@/lib/types";
import { useSettings } from "@/hooks/useSettings";
import { useConnectionStates } from "@/hooks/useConnectionStates";
import { usePrefs, type Theme } from "@/hooks/usePrefs";
import { ServiceForm } from "./ServiceForm";
import { parseConfigFile } from "@/lib/importConfig";
import { checkUpdate, saveService } from "@/lib/tauri";
import { notifyUpdate } from "@/hooks/useUpdates";
import { versionLabel } from "@/lib/version";
import { errorMessage } from "@/lib/errors";
import { settingsKey } from "@/hooks/useSettings";

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

function Preferences() {
  const [prefs, setPrefs] = usePrefs();
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
  return (
    <section className="card divide-y divide-border">
      <div className="flex items-center justify-between gap-4 p-4">
        <span className="text-sm">{t.settings.theme}</span>
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
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <span className="text-sm">{t.settings.notifications}</span>
        <Toggle label={t.settings.notifications} checked={prefs.notifications} onChange={(notifications) => setPrefs({ notifications })} />
      </div>
      {autostart !== null && (
        <div className="flex items-center justify-between gap-4 p-4">
          <span className="text-sm">{t.settings.autostart}</span>
          <Toggle label={t.settings.autostart} checked={autostart} onChange={toggleAutostart} />
        </div>
      )}
    </section>
  );
}

function Updates() {
  const [state, setState] = useState<"idle" | "checking" | "latest">("idle");
  async function check() {
    setState("checking");
    try {
      const u = await checkUpdate();
      if (u) {
        setState("idle");
        notifyUpdate(u);
      } else setState("latest");
    } catch (e) {
      setState("idle");
      toast.error(errorMessage(e));
    }
  }
  return (
    <section className="card flex items-center justify-between gap-4 p-4">
      <div className="text-sm">
        Dasharr {versionLabel()}
        {state === "latest" && <span className="ml-3 text-muted">{t.updates.upToDate}</span>}
      </div>
      <button className="btn-outline" onClick={check} disabled={state === "checking"}>
        {state === "checking" ? t.updates.checking : t.updates.check}
      </button>
    </section>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useSettings();
  const { data: routes } = useConnectionStates();
  const [generation, setGeneration] = useState(0);
  return (
    <Page title={t.nav.settings} actions={<ImportButton onImported={() => setGeneration((g) => g + 1)} />}>
      <div className="flex max-w-4xl flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t.settings.servicesTitle}</h2>
          <p className="text-sm text-muted">{t.settings.autoSwitch}</p>
        </div>
        {isLoading ? (
          <Loading />
        ) : (
          SERVICE_KINDS.map((s) => <ServiceForm key={`${s}-${generation}`} service={s} view={data?.[s]} route={routes?.[s]} />)
        )}
        <h2 className="mt-4 text-lg font-semibold">{t.settings.preferences}</h2>
        <Preferences />
        <h2 className="mt-4 text-lg font-semibold">{t.updates.title}</h2>
        <Updates />
      </div>
    </Page>
  );
}
