import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Page } from "@/components/Page";
import { Loading, Segmented, Toggle } from "@/components/ui";
import { t } from "@/i18n/es";
import { SERVICE_KINDS } from "@/lib/types";
import { useSettings } from "@/hooks/useSettings";
import { useConnectionStates } from "@/hooks/useConnectionStates";
import { usePrefs, type Theme } from "@/hooks/usePrefs";
import { ServiceForm } from "./ServiceForm";

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

export default function SettingsPage() {
  const { data, isLoading } = useSettings();
  const { data: routes } = useConnectionStates();
  return (
    <Page title={t.nav.settings}>
      <div className="flex max-w-4xl flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t.settings.servicesTitle}</h2>
          <p className="text-sm text-muted">{t.settings.autoSwitch}</p>
        </div>
        {isLoading ? <Loading /> : SERVICE_KINDS.map((s) => <ServiceForm key={s} service={s} view={data?.[s]} route={routes?.[s]} />)}
        <h2 className="mt-4 text-lg font-semibold">{t.settings.preferences}</h2>
        <Preferences />
      </div>
    </Page>
  );
}
