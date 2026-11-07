import { Link } from "react-router-dom";
import { useSeerrRequests } from "@/hooks/useSeerr";
import { t } from "@/i18n/es";
import { RequestRow } from "./RequestRow";

/** Inicio: solicitudes de Seerr esperando aprobación, con aprobar y rechazar a mano. Oculto si no hay. */
export function PendingRequests() {
  const q = useSeerrRequests({ filter: "pending", page: 1, mediaType: "all", sort: "added" });
  const list = q.data?.results ?? [];
  if (q.configured !== true || q.isError || !list.length) return null;
  const total = q.data?.pageInfo.results ?? list.length;
  return (
    <section className="flex flex-col gap-3" data-service="seerr">
      <div className="flex items-center justify-between">
        <h2 className="flex items-baseline gap-3 text-lg font-semibold">
          {t.seerr.pendingHome}
          <span className="font-sans text-sm font-normal text-muted [font-stretch:100%]">{t.seerr.pendingCount(total)}</span>
        </h2>
        <Link to="/solicitudes" className="text-sm text-accent hover:underline">
          {t.home.seeAll}
        </Link>
      </div>
      <div className="card divide-y divide-border">
        {list.slice(0, 5).map((r) => (
          <RequestRow key={r.id} request={r} compact />
        ))}
      </div>
    </section>
  );
}
