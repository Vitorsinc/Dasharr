import { Link } from "react-router-dom";
import { AlertTriangle, Settings } from "lucide-react";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { isApiError, type ServiceKind } from "@/lib/types";
import { cn } from "@/lib/cn";

export function NotConfigured({ service, compact }: { service: ServiceKind; compact?: boolean }) {
  const name = t.services[service];
  return (
    <div className={cn("card flex flex-col items-center gap-3 text-center", compact ? "p-4" : "p-10")}>
      <Settings className="h-8 w-8 text-muted" aria-hidden />
      <div>
        <p className="font-medium">{t.common.notConfigured(name)}</p>
        {!compact && <p className="mt-1 text-sm text-muted">{t.common.notConfiguredHint}</p>}
      </div>
      <Link to="/ajustes" className="btn-outline">
        {t.common.goToSettings}
      </Link>
    </div>
  );
}

export function ErrorPanel({
  service,
  error,
  onRetry,
  compact,
}: {
  service: ServiceKind;
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  if (isApiError(error) && error.kind === "NotConfigured") return <NotConfigured service={service} compact={compact} />;
  return (
    <div role="alert" className={cn("card flex flex-col items-center gap-3 border-danger/40 text-center", compact ? "p-4" : "p-10")}>
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <div>
        <p className="font-medium">{t.errors.cannotConnect(t.services[service])}</p>
        <p className="mt-1 text-sm text-muted">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <button className="btn-outline" onClick={onRetry}>
          {t.common.retry}
        </button>
      )}
    </div>
  );
}
