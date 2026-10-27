import { SERVICE_KINDS, type SecretsPatch, type ServiceConfig, type ServiceKind } from "./types";

export interface ImportedService {
  service: ServiceKind;
  config: ServiceConfig;
  secrets: SecretsPatch;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Lee un archivo de configuración de Dasharr:
 * { "services": { "radarr": { "localUrl", "externalUrl", "apiKey", "proxyUsername", "proxyPassword" },
 *                 "qbittorrent": { "localUrl", "username", "password" } } }
 * Ignora servicios desconocidos y los que no tienen ninguna dirección. Los secretos ausentes se mantienen.
 */
export function parseConfigFile(text: string): ImportedService[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  const services = (data as { services?: unknown })?.services;
  if (!services || typeof services !== "object") throw new Error('El archivo no tiene la sección "services".');
  const out: ImportedService[] = [];
  for (const service of SERVICE_KINDS) {
    const s = (services as Record<string, Record<string, unknown> | undefined>)[service];
    if (!s || typeof s !== "object") continue;
    const localUrl = str(s.localUrl) ?? null;
    const externalUrl = str(s.externalUrl) ?? null;
    if (!localUrl && !externalUrl) continue;
    out.push({
      service,
      config: { localUrl, externalUrl, enabled: true },
      secrets: {
        apiKey: str(s.apiKey),
        username: str(s.username),
        password: str(s.password),
        proxyUsername: str(s.proxyUsername),
        proxyPassword: str(s.proxyPassword),
      },
    });
  }
  if (!out.length) throw new Error("El archivo no contiene ningún servicio con dirección.");
  return out;
}
