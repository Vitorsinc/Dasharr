import { apiRequest } from "@/lib/tauri";
import type { ArrService, QualityProfile, RootFolder } from "./arr";

export interface Tag {
  id: number;
  label: string;
}

/** `GET /tag/detail`: en qué se usa cada etiqueta. Radarr trae `movieIds`; Sonarr, `seriesIds`. */
export interface TagDetail extends Tag {
  movieIds?: number[];
  seriesIds?: number[];
  delayProfileIds?: number[];
  importListIds?: number[];
  notificationIds?: number[];
  indexerIds?: number[];
  downloadClientIds?: number[];
  restrictionIds?: number[];
  autoTagIds?: number[];
}

export interface QualityDefinition {
  id: number;
  name: string;
  source?: string;
  resolution?: number;
}

/** Elemento del perfil: una calidad suelta (`quality`) o un grupo (`id`, `name`, `items`). */
export interface ProfileItem {
  id?: number;
  name?: string;
  quality?: QualityDefinition;
  items: ProfileItem[];
  allowed: boolean;
}

export interface FormatItem {
  format: number;
  name: string;
  score: number;
}

/**
 * Perfil de calidad completo. `items` va de peor a mejor calidad (como lo guarda el *arr; su web lo
 * enseña al revés). `cutoff` es el id de la calidad o del grupo hasta el que se mejora.
 */
export interface QualityProfileFull extends QualityProfile {
  upgradeAllowed: boolean;
  cutoff: number;
  items: ProfileItem[];
  minFormatScore: number;
  cutoffFormatScore: number;
  minUpgradeFormatScore?: number;
  formatItems: FormatItem[];
  [extra: string]: unknown;
}

export interface CustomFormatSpec {
  id?: number;
  name: string;
  implementation: string;
  implementationName?: string;
  negate: boolean;
  required: boolean;
  fields: { name: string; value: unknown }[];
}

export interface CustomFormat {
  id: number;
  name: string;
  includeCustomFormatWhenRenaming?: boolean;
  specifications: CustomFormatSpec[];
}

export interface RootFolderFull extends RootFolder {
  accessible?: boolean;
  unmappedFolders?: { name: string; path: string }[];
}

export interface DelayProfile {
  id: number;
  enableUsenet: boolean;
  enableTorrent: boolean;
  preferredProtocol: "usenet" | "torrent";
  /** Minutos. */
  usenetDelay: number;
  torrentDelay: number;
  bypassIfHighestQuality: boolean;
  bypassIfAboveCustomFormatScore?: boolean;
  minimumCustomFormatScore?: number;
  order: number;
  tags: number[];
}

/** Lista de importación (Trakt, TMDb, Plex watchlist…). El resto de campos se devuelve tal cual al guardar. */
export interface ImportList {
  id: number;
  name: string;
  implementation?: string;
  implementationName?: string;
  listType?: string;
  /** Radarr: si la lista está activa. */
  enabled?: boolean;
  /** Radarr: si añade sola lo que encuentra. */
  enableAuto?: boolean;
  /** Sonarr: si la lista está activa (añade sola lo que encuentra). */
  enableAutomaticAdd?: boolean;
  [extra: string]: unknown;
}

/** Elemento que las listas no deben volver a añadir. Radarr: `tmdbId`, `movieTitle`; Sonarr: `tvdbId`, `title`. */
export interface ImportExclusion {
  id: number;
  tmdbId?: number;
  movieTitle?: string;
  movieYear?: number;
  tvdbId?: number;
  title?: string;
}

/** Campo que activa o desactiva una lista: Radarr usa `enabled`; Sonarr, `enableAutomaticAdd`. */
export function importListEnabledKey(service: ArrService): "enabled" | "enableAutomaticAdd" {
  return service === "radarr" ? "enabled" : "enableAutomaticAdd";
}

export function isImportListEnabled(service: ArrService, list: ImportList): boolean {
  return !!list[importListEnabledKey(service)];
}

/** Las exclusiones están en `/exclusions` en Radarr y en `/importlistexclusion` en Sonarr. */
export function exclusionsPath(service: ArrService) {
  return service === "radarr" ? "/api/v3/exclusions" : "/api/v3/importlistexclusion";
}

export function exclusionLabel(e: ImportExclusion): string {
  const title = e.movieTitle ?? e.title ?? "?";
  return e.movieYear ? `${title} (${e.movieYear})` : title;
}

/** El perfil de retraso por defecto (sin etiquetas, el último) no se puede borrar ni etiquetar. */
export const DEFAULT_DELAY_PROFILE_ID = 1;

/** Ajustes de biblioteca de Radarr/Sonarr (Settings → Profiles, Custom Formats, Media Management, Tags). */
export function arrManage(service: ArrService) {
  const req = apiRequest;
  return {
    getTags: () => req<Tag[]>(service, { path: "/api/v3/tag" }),
    getTagDetails: () => req<TagDetail[]>(service, { path: "/api/v3/tag/detail" }),
    createTag: (label: string) => req<Tag>(service, { method: "POST", path: "/api/v3/tag", json: { label } }),
    updateTag: (tag: Tag) => req<Tag>(service, { method: "PUT", path: `/api/v3/tag/${tag.id}`, json: tag }),
    deleteTag: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/tag/${id}` }),

    getQualityProfiles: () => req<QualityProfileFull[]>(service, { path: "/api/v3/qualityprofile" }),
    /** Plantilla de perfil nuevo con todas las calidades y formatos del *arr. */
    getQualityProfileSchema: () => req<QualityProfileFull>(service, { path: "/api/v3/qualityprofile/schema" }),
    createQualityProfile: (p: QualityProfileFull) =>
      req<QualityProfileFull>(service, { method: "POST", path: "/api/v3/qualityprofile", json: { ...p, id: undefined } }),
    updateQualityProfile: (p: QualityProfileFull) =>
      req<QualityProfileFull>(service, { method: "PUT", path: `/api/v3/qualityprofile/${p.id}`, json: p }),
    deleteQualityProfile: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/qualityprofile/${id}` }),

    getCustomFormats: () => req<CustomFormat[]>(service, { path: "/api/v3/customformat" }),
    createCustomFormat: (cf: Omit<CustomFormat, "id">) => req<CustomFormat>(service, { method: "POST", path: "/api/v3/customformat", json: cf }),
    updateCustomFormat: (cf: CustomFormat) => req<CustomFormat>(service, { method: "PUT", path: `/api/v3/customformat/${cf.id}`, json: cf }),
    deleteCustomFormat: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/customformat/${id}` }),

    getRootFolders: () => req<RootFolderFull[]>(service, { path: "/api/v3/rootfolder" }),
    addRootFolder: (path: string) => req<RootFolderFull>(service, { method: "POST", path: "/api/v3/rootfolder", json: { path } }),
    deleteRootFolder: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/rootfolder/${id}` }),

    getImportLists: () => req<ImportList[]>(service, { path: "/api/v3/importlist" }),
    /** Se manda la lista completa tal como llegó, cambiando solo el campo de activación. */
    setImportListEnabled: (list: ImportList, on: boolean) =>
      req<ImportList>(service, {
        method: "PUT",
        path: `/api/v3/importlist/${list.id}`,
        json: { ...list, [importListEnabledKey(service)]: on },
      }),
    deleteImportList: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/importlist/${id}` }),
    /** Consulta ahora todas las listas activas (comando `ImportListSync`). */
    syncImportLists: () => req<unknown>(service, { method: "POST", path: "/api/v3/command", json: { name: "ImportListSync" } }),
    getExclusions: () => req<ImportExclusion[]>(service, { path: exclusionsPath(service) }),
    deleteExclusion: (id: number) => req<unknown>(service, { method: "DELETE", path: `${exclusionsPath(service)}/${id}` }),

    getDelayProfiles: () => req<DelayProfile[]>(service, { path: "/api/v3/delayprofile" }),
    createDelayProfile: (p: Omit<DelayProfile, "id">) => req<DelayProfile>(service, { method: "POST", path: "/api/v3/delayprofile", json: p }),
    updateDelayProfile: (p: DelayProfile) => req<DelayProfile>(service, { method: "PUT", path: `/api/v3/delayprofile/${p.id}`, json: p }),
    deleteDelayProfile: (id: number) => req<unknown>(service, { method: "DELETE", path: `/api/v3/delayprofile/${id}` }),
  };
}

/**
 * Convierte el JSON de un formato personalizado (exportado de Radarr/Sonarr o de las guías TRaSH) al
 * formato de la API. Las guías ponen `fields` como objeto (`{ "value": "x" }`); la API quiere una lista.
 * Lanza un Error con el motivo si el texto no sirve.
 */
export function parseCustomFormatJson(text: string): Omit<CustomFormat, "id"> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("invalid-json");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid-json");
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) throw new Error("missing-name");
  if (!Array.isArray(o.specifications)) throw new Error("missing-specs");
  const specifications = o.specifications.map((s): CustomFormatSpec => {
    const spec = (s ?? {}) as Record<string, unknown>;
    if (typeof spec.implementation !== "string") throw new Error("missing-specs");
    const f = spec.fields;
    const fields = Array.isArray(f)
      ? (f as { name: string; value: unknown }[]).map((x) => ({ name: x.name, value: x.value }))
      : f && typeof f === "object"
        ? Object.entries(f as Record<string, unknown>).map(([name, value]) => ({ name, value }))
        : [];
    return {
      name: String(spec.name ?? ""),
      implementation: spec.implementation,
      negate: !!spec.negate,
      required: !!spec.required,
      fields,
    };
  });
  return {
    name: o.name.trim(),
    includeCustomFormatWhenRenaming: !!o.includeCustomFormatWhenRenaming,
    specifications,
  };
}

/** JSON editable de un formato: lo mismo que exporta Radarr/Sonarr, sin ids. */
export function customFormatToJson(cf: Pick<CustomFormat, "name" | "includeCustomFormatWhenRenaming" | "specifications">): string {
  return JSON.stringify(
    {
      name: cf.name,
      includeCustomFormatWhenRenaming: !!cf.includeCustomFormatWhenRenaming,
      specifications: cf.specifications.map((s) => ({
        name: s.name,
        implementation: s.implementation,
        negate: s.negate,
        required: s.required,
        fields: Object.fromEntries(s.fields.map((f) => [f.name, f.value])),
      })),
    },
    null,
    2,
  );
}
