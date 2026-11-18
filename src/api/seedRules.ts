import type { Indexer, ProviderField } from "./prowlarr";

/** Nombre de los campos de siembra de un indexador de torrents en Prowlarr (en minutos y ratio). */
export const SEED_FIELDS = {
  ratio: "torrentBaseSettings.seedRatio",
  time: "torrentBaseSettings.seedTime",
  packTime: "torrentBaseSettings.packSeedTime",
} as const;

/** Lo mínimo que hay que sembrar en un tracker, según su indexador de Prowlarr. */
export interface SeedRule {
  indexer: string;
  /** Dominios del tracker (sin subdominio) para reconocer torrents que no salen en el historial. */
  domains: string[];
  ratio?: number;
  /** Minutos. */
  minutes?: number;
  /** Minutos para packs de temporada (Sonarr usa este si lo hay). */
  packMinutes?: number;
}

type IndexerWithFields = Indexer & { fields?: ProviderField[]; indexerUrls?: string[] };

const num = (fields: ProviderField[] | undefined, name: string) => {
  const v = Number(fields?.find((f) => f.name === name)?.value);
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Dominio registrable aproximado: «tracker.hd-olimpo.club» → «hd-olimpo.club». */
export function baseDomain(urlOrHost: string | undefined | null): string | undefined {
  if (!urlOrHost) return undefined;
  let host: string;
  try {
    host = new URL(/^\w+:\/\//.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`).hostname;
  } catch {
    return undefined;
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".") || undefined;
  // co.uk, com.br…: tres partes.
  const two = parts.slice(-2);
  return (two[0].length <= 3 && two[1].length <= 3 ? parts.slice(-3) : two).join(".");
}

/** Reglas de siembra de los indexadores de torrents de Prowlarr que tienen alguna puesta. */
export function seedRules(indexers: IndexerWithFields[]): SeedRule[] {
  return indexers
    .filter((ix) => ix.protocol === "torrent")
    .map((ix) => {
      const urls = [...(ix.indexerUrls ?? []), String(ix.fields?.find((f) => f.name === "baseUrl")?.value ?? "")];
      return {
        indexer: ix.name,
        domains: [...new Set(urls.map(baseDomain).filter((d): d is string => !!d))],
        ratio: num(ix.fields, SEED_FIELDS.ratio),
        minutes: num(ix.fields, SEED_FIELDS.time),
        packMinutes: num(ix.fields, SEED_FIELDS.packTime),
      };
    })
    .filter((r) => r.ratio || r.minutes || r.packMinutes);
}

/** «HD-Olimpo (Prowlarr)» → «hd-olimpo»: así llama Radarr/Sonarr a los indexadores que le pasa Prowlarr. */
const normName = (n: string) =>
  n
    .replace(/\s*\(Prowlarr\)\s*$/i, "")
    .trim()
    .toLowerCase();

/** La regla de un torrent: por el indexador del historial o, si no, por el dominio de su tracker. */
export function ruleFor(rules: SeedRule[], indexerName: string | undefined, trackerUrl: string | undefined): SeedRule | undefined {
  if (indexerName) {
    const byName = rules.find((r) => normName(r.indexer) === normName(indexerName));
    if (byName) return byName;
  }
  const domain = baseDomain(trackerUrl);
  return domain ? rules.find((r) => r.domains.includes(domain)) : undefined;
}
