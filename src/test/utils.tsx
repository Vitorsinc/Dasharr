import { render } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import App, { makeQueryClient } from "@/App";
import type { ServiceKind, ServiceSettingsView } from "@/lib/types";

type Handler = (args: any) => unknown;
export type ApiHandlers = Partial<
  Record<ServiceKind, (req: { method: string; path: string; query: [string, string][]; body: any }) => unknown>
>;

export function view(urls: { local?: string; external?: string } = {}, extra: Partial<ServiceSettingsView> = {}): ServiceSettingsView {
  return {
    config: { localUrl: urls.local ?? null, externalUrl: urls.external ?? null, enabled: true },
    hasApiKey: true,
    hasPassword: false,
    hasProxyPassword: false,
    ...extra,
  };
}

export function allConfigured(): Record<ServiceKind, ServiceSettingsView> {
  return {
    radarr: view({ local: "http://h:7878" }),
    sonarr: view({ local: "http://h:8989" }),
    prowlarr: view({ local: "http://h:9696" }),
    bazarr: view({ local: "http://h:6767" }),
    qbittorrent: view({ local: "http://h:8080" }, { hasApiKey: false, username: "admin", hasPassword: true }),
    tracearr: view({ local: "http://h:3000" }),
    plex: view({ local: "http://h:32400" }),
  };
}

/** Simula el backend de Tauri: comandos y peticiones por servicio. */
export function mockBackend(
  opts: { settings?: Record<ServiceKind, ServiceSettingsView>; api?: ApiHandlers; commands?: Record<string, Handler> } = {},
) {
  const settings = opts.settings ?? allConfigured();
  const mock = vi.mocked(invoke);
  mock.mockImplementation(async (cmd: string, args?: any) => {
    if (opts.commands?.[cmd]) return opts.commands[cmd](args);
    switch (cmd) {
      case "get_settings":
        return settings;
      case "get_connection_states":
      case "refresh_connections":
        return { radarr: "local", sonarr: "local", prowlarr: "local", bazarr: "local", qbittorrent: "local", tracearr: "local", plex: "local" };
      case "api_request": {
        const h = opts.api?.[args.service as ServiceKind];
        if (!h) throw { kind: "NotConfigured" };
        return h(args.request);
      }
    }
    return undefined;
  });
  return mock;
}

export function renderApp(path = "/") {
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  return render(<App client={client} initialPath={path} />);
}
