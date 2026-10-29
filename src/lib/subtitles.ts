/** Idiomas de subtítulos de una release. Sonarr/Radarr no los detectan en las releases de anime, así que se
 * leen del título (etiquetas como `[Multi-Subs]`, `[ESP]` o `[ENG][SPA-LA]`) y, en Nyaa, de la página del torrent. */

export interface TitleSubs {
  /** Códigos como «es», «es-419» o «en», en orden de aparición. */
  languages: string[];
  /** Dice que trae varios idiomas sin decir cuáles. */
  multi: boolean;
}

const MULTI = /\b(?:multiple[\s._-]*subtitles?|multi[\s._-]*subs?)\b/i;
// La misma idea que el formato personalizado de Sonarr: frases que dicen «subtítulos en español».
const SPANISH =
  /\b(?:subs?[\s._-]*(?:en[\s._-]*)?esp(?:a[ñn]ol)?|subtitulad[oa]s?[\s._-]*(?:en[\s._-]*)?espa[ñn]ol|vose|castellano|spanish(?![\s._-]*(?:dub|audio))(?:[\s._-]*subs?)?|espa[ñn]ol(?![\s._-]*(?:dub|audio|latino)))(?![\p{L}])/iu;

const CODES: Record<string, string> = {
  eng: "en",
  en: "en",
  spa: "es",
  esp: "es",
  es: "es",
  por: "pt",
  pt: "pt",
  fre: "fr",
  fra: "fr",
  fr: "fr",
  ger: "de",
  deu: "de",
  de: "de",
  ita: "it",
  it: "it",
  rus: "ru",
  ru: "ru",
  ara: "ar",
  ar: "ar",
  chi: "zh",
  chs: "zh",
  cht: "zh",
  kor: "ko",
  pol: "pl",
  tur: "tr",
  ind: "id",
  vie: "vi",
  tha: "th",
  may: "ms",
  msa: "ms",
  hin: "hi",
};
const LATAM = new Set(["la", "lat", "latam", "419", "mx"]);
const BRAZIL = new Set(["br", "bra"]);

/** Códigos de idioma sueltos entre corchetes o paréntesis: `[ENG][SPA-LA]`, `(ENG+SPA)`, `[POR-BR, ITA]`. */
function bracketCodes(title: string): string[] {
  const out: string[] = [];
  for (const [, inner] of title.matchAll(/[[(]([^\])]{2,40})[\])]/g)) {
    if (/dub|audio/i.test(inner)) continue;
    const items = inner.split(/[+,/&|\s]+/).filter(Boolean);
    const codes = items.map((item) => {
      const [base, region] = item.toLowerCase().split("-");
      const code = CODES[base];
      if (!code) return null;
      if (code === "es" && region && LATAM.has(region)) return "es-419";
      if (code === "pt" && region && BRAZIL.has(region)) return "pt-BR";
      return region ? null : code;
    });
    // Solo si todo el grupo son idiomas: «[DE Edition]» o «[1080p ES]» no cuentan.
    if (codes.every((c): c is string => c !== null)) out.push(...codes);
  }
  return out;
}

export function titleSubtitles(title: string): TitleSubs {
  const languages = bracketCodes(title);
  if (SPANISH.test(title) && !languages.some((l) => l.startsWith("es"))) languages.unshift("es");
  return { languages: [...new Set(languages)], multi: MULTI.test(title) };
}

export const isNyaaPage = (url?: string) => !!url && /^https?:\/\/[^/]*nyaa[^/]*\/view\/\d+\/?(?:[?#]|$)/i.test(url);

export const hasSpanish = (languages: string[]) => languages.some((l) => l === "es" || l.startsWith("es-"));

export function langLabel(code: string) {
  if (code === "es-419") return "ES-LA";
  return code.toUpperCase();
}

/** Une dos listas sin repetir, dejando primero las de la primera. */
export function mergeLanguages(a: string[], b: string[]) {
  return [...new Set([...a, ...b])];
}
