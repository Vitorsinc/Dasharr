import { Cloud } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { useGoogleStatus } from "@/hooks/useGoogleSync";
import { usePrefs } from "@/hooks/usePrefs";
import { GoogleSignInButton } from "@/pages/Settings/GoogleSync";
import { t } from "@/i18n/es";

/** Al abrir Dasharr por primera vez en un dispositivo: ¿usar la cuenta de Google para guardar y traer la configuración? */
export function GoogleWelcome() {
  const [prefs, setPrefs] = usePrefs();
  const { data: status } = useGoogleStatus();
  const open = !!(status?.available && !status.signedIn && !prefs.googlePromptSeen);
  const close = () => setPrefs({ googlePromptSeen: true });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={t.google.welcomeTitle}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
          <p className="text-sm text-muted">{t.google.welcomeText}</p>
        </div>
        <GoogleSignInButton onDone={close} />
        <div className="flex justify-end">
          <button className="btn-ghost" onClick={close}>
            {t.google.welcomeLater}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
