import { Ban, FolderTree, Gauge, Hourglass, ListPlus, Sparkles, Tags as TagsIcon, type LucideIcon } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Page } from "@/components/Page";
import { NotConfigured } from "@/components/ErrorPanel";
import { TabNav } from "@/components/TabNav";
import type { ArrService } from "@/api/arr";
import { useIsConfigured } from "@/hooks/useSettings";
import { t } from "@/i18n/es";
import { Tags } from "./Tags";
import { QualityProfiles } from "./QualityProfiles";
import { CustomFormats } from "./CustomFormats";
import { RootFolders } from "./RootFolders";
import { DelayProfiles } from "./DelayProfiles";
import { Exclusions, ImportLists } from "./ImportLists";

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  render: (service: ArrService) => ReactNode;
}

const tabs: Tab[] = [
  { id: "perfiles", label: t.manage.tabs.profiles, icon: Gauge, render: (s) => <QualityProfiles key={s} service={s} /> },
  { id: "formatos", label: t.manage.tabs.formats, icon: Sparkles, render: (s) => <CustomFormats key={s} service={s} /> },
  { id: "etiquetas", label: t.manage.tabs.tags, icon: TagsIcon, render: (s) => <Tags key={s} service={s} /> },
  { id: "carpetas", label: t.manage.tabs.roots, icon: FolderTree, render: (s) => <RootFolders key={s} service={s} /> },
  { id: "retraso", label: t.manage.tabs.delay, icon: Hourglass, render: (s) => <DelayProfiles key={s} service={s} /> },
  { id: "listas", label: t.manage.tabs.lists, icon: ListPlus, render: (s) => <ImportLists key={s} service={s} /> },
  { id: "exclusiones", label: t.manage.tabs.exclusions, icon: Ban, render: (s) => <Exclusions key={s} service={s} /> },
];

/** Ajustes de biblioteca de Radarr o Sonarr: perfiles, formatos, etiquetas, carpetas, retrasos y listas de importación. */
export default function ManagePage({ service }: { service: ArrService }) {
  const { tab = tabs[0].id } = useParams();
  const configured = useIsConfigured(service);
  const current = tabs.find((x) => x.id === tab);
  const base = `/gestion/${service}`;
  if (!current) return <Navigate to={base} replace />;
  return (
    <Page title={t.manage.title(t.services[service])}>
      {configured === false ? (
        <NotConfigured service={service} />
      ) : (
        <>
          <TabNav tabs={tabs} current={current.id} base={base} label={t.manage.tabsLabel} />
          <div className="max-w-4xl">{current.render(service)}</div>
        </>
      )}
    </Page>
  );
}
