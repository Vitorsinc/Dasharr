import { Ban, FolderTree, Gauge, Hourglass, ListPlus, Sparkles, Tags as TagsIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ArrService } from "@/api/arr";
import type { ServiceKind } from "@/lib/types";
import { t } from "@/i18n/es";
import { Tags } from "./Tags";
import { QualityProfiles } from "./QualityProfiles";
import { CustomFormats } from "./CustomFormats";
import { RootFolders } from "./RootFolders";
import { DelayProfiles } from "./DelayProfiles";
import { Exclusions, ImportLists } from "./ImportLists";

export interface ManageTab {
  id: string;
  label: string;
  icon: LucideIcon;
  render: (service: ArrService) => ReactNode;
}

/**
 * Ajustes de biblioteca de Radarr o Sonarr: perfiles, formatos, etiquetas, carpetas, retrasos y listas de importación.
 * Viven en Ajustes → Servicios → Radarr/Sonarr, junto a la conexión.
 */
export const manageTabs: ManageTab[] = [
  { id: "perfiles", label: t.manage.tabs.profiles, icon: Gauge, render: (s) => <QualityProfiles key={s} service={s} /> },
  { id: "formatos", label: t.manage.tabs.formats, icon: Sparkles, render: (s) => <CustomFormats key={s} service={s} /> },
  { id: "etiquetas", label: t.manage.tabs.tags, icon: TagsIcon, render: (s) => <Tags key={s} service={s} /> },
  { id: "carpetas", label: t.manage.tabs.roots, icon: FolderTree, render: (s) => <RootFolders key={s} service={s} /> },
  { id: "retraso", label: t.manage.tabs.delay, icon: Hourglass, render: (s) => <DelayProfiles key={s} service={s} /> },
  { id: "listas", label: t.manage.tabs.lists, icon: ListPlus, render: (s) => <ImportLists key={s} service={s} /> },
  { id: "exclusiones", label: t.manage.tabs.exclusions, icon: Ban, render: (s) => <Exclusions key={s} service={s} /> },
];

/** Solo Radarr y Sonarr tienen menús de gestión. */
export function isManageable(service: ServiceKind): service is ArrService {
  return service === "radarr" || service === "sonarr";
}
