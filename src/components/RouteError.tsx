import { useRouteError } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { errorMessage } from "@/lib/errors";

/** Si una pantalla falla al dibujarse, se muestra este aviso en su lugar sin tumbar el resto de la app. */
export function RouteError() {
  const error = useRouteError();
  return (
    <div role="alert" className="mx-auto mt-24 flex max-w-md flex-col items-center gap-3 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" aria-hidden />
      <h1 className="text-lg font-semibold">Algo ha fallado en esta pantalla</h1>
      <p className="break-all text-sm text-muted">{errorMessage(error)}</p>
      <button className="btn-outline" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </div>
  );
}
