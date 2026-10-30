/** Países con fechas de estreno en TMDB que más se usan; el nombre lo da el navegador en español. */
const CODES = [
  "ES",
  "US",
  "GB",
  "MX",
  "AR",
  "CO",
  "CL",
  "PE",
  "VE",
  "UY",
  "PT",
  "BR",
  "FR",
  "DE",
  "IT",
  "NL",
  "BE",
  "CH",
  "AT",
  "IE",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CZ",
  "GR",
  "TR",
  "CA",
  "AU",
  "NZ",
  "JP",
  "KR",
  "IN",
];

const names = new Intl.DisplayNames(["es"], { type: "region" });

export function countryName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRIES = CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "es"));
