import { Ban, type LucideIcon } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Page } from "@/components/Page";
import { NotConfigured } from "@/components/ErrorPanel";
import { TabNav } from "@/components/TabNav";
import type { ArrService } from "@/api/arr";
import { useIsConfigured } from "@/hooks/useSettings";
import { t } from "@/i18n/es";
import { Blocklist } from "./Blocklist";

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  render: (service: ArrService) => ReactNode;
}

const tabs: Tab[] = [{ id: "bloqueadas", label: t.activity.blocklist, icon: Ban, render: (s) => <Blocklist key={s} service={s} /> }];

/** «Actividad» de Radarr o Sonarr, como en sus webs: lo que han bajado y lo que han bloqueado. */
export default function ActivityPage({ service }: { service: ArrService }) {
  const { tab = tabs[0].id } = useParams();
  const configured = useIsConfigured(service);
  const current = tabs.find((x) => x.id === tab);
  const base = `/actividad/${service}`;
  if (!current) return <Navigate to={base} replace />;
  const title = t.activity.title(t.services[service]);
  return (
    <Page title={title}>
      {configured === false ? (
        <NotConfigured service={service} />
      ) : (
        <>
          <TabNav tabs={tabs} current={current.id} base={base} label={t.activity.tabsLabel} />
          {current.render(service)}
        </>
      )}
    </Page>
  );
}
