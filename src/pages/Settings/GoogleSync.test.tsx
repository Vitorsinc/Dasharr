import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { getPrefs, setPrefs } from "@/hooks/usePrefs";
import { syncedPrefs } from "@/hooks/useGoogleSync";
import type { GoogleStatus } from "@/api/google";

const base: GoogleStatus = { available: true, signedIn: false, email: null, linked: false, lastSync: null };

beforeEach(() => setPrefs({ googlePromptSeen: true }));

test("sin identificador de Google lo explica", async () => {
  mockBackend({ commands: { google_status: () => ({ ...base, available: false }) } });
  renderApp("/ajustes/sistema");
  expect(await screen.findByText(/todavía no trae la conexión con Google/)).toBeInTheDocument();
});

test("inicia sesión y, sin nada guardado, sube la configuración", async () => {
  let status = { ...base };
  const push = vi.fn((_args: { force: boolean }) => {
    status = { ...status, linked: true, lastSync: Date.now() };
    return { status: "uploaded" };
  });
  mockBackend({
    commands: {
      google_status: () => status,
      google_login: () => {
        status = { ...status, signedIn: true, email: "yo@gmail.com" };
        return "yo@gmail.com";
      },
      sync_pull: () => ({ status: "empty" }),
      sync_push: push,
    },
  });
  renderApp("/ajustes/sistema");
  await userEvent.click(await screen.findByRole("button", { name: "Iniciar sesión con Google" }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(push.mock.calls[0][0]).toMatchObject({ force: true });
  expect(await screen.findByText("Sesión iniciada como yo@gmail.com")).toBeInTheDocument();
  expect(await screen.findByText(/Sincronizado automáticamente/)).toBeInTheDocument();
});

test("al abrir pregunta por Google y carga lo guardado en la cuenta", async () => {
  setPrefs({ googlePromptSeen: false, theme: "dark", sidebarCollapsed: [] });
  let status = { ...base };
  const pull = vi.fn(() => {
    status = { ...status, linked: true, lastSync: Date.now() };
    return { status: "applied", prefs: { theme: "light", sidebarCollapsed: ["x"] }, updatedAt: Date.now(), device: "Windows" };
  });
  const push = vi.fn(() => ({ status: "unchanged" }));
  mockBackend({
    commands: {
      google_status: () => status,
      google_login: () => {
        status = { ...status, signedIn: true, email: "yo@gmail.com" };
        return "yo@gmail.com";
      },
      sync_pull: pull,
      sync_push: push,
    },
  });
  renderApp("/");
  const dialog = await screen.findByRole("dialog", { name: "¿Usar tu cuenta de Google?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Iniciar sesión con Google" }));
  await waitFor(() => expect(pull).toHaveBeenCalledWith({ force: true }));
  await waitFor(() => expect(getPrefs().theme).toBe("light"));
  // Lo que depende de la pantalla de cada dispositivo no viaja.
  expect(getPrefs().sidebarCollapsed).toEqual([]);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(getPrefs().googlePromptSeen).toBe(true);
});

test("«Ahora no» no vuelve a preguntar", async () => {
  setPrefs({ googlePromptSeen: false });
  mockBackend({ commands: { google_status: () => base } });
  renderApp("/");
  await userEvent.click(await screen.findByRole("button", { name: "Ahora no" }));
  expect(getPrefs().googlePromptSeen).toBe(true);
});

test("las preferencias de cada dispositivo no se suben", () => {
  setPrefs({ sidebarCollapsed: ["a"], downloadColumns: ["name"], releaseCountry: "MX" });
  const p = syncedPrefs();
  expect(p).not.toHaveProperty("sidebarCollapsed");
  expect(p).not.toHaveProperty("downloadColumns");
  expect(p).not.toHaveProperty("googlePromptSeen");
  expect(p.releaseCountry).toBe("MX");
});

test("en el PC, si el navegador no vuelve solo, se puede pegar la dirección", async () => {
  let finish: (v: string) => void = () => {};
  const paste = vi.fn(() => finish("yo@gmail.com"));
  mockBackend({
    commands: {
      google_status: () => base,
      google_login: () => new Promise<string>((r) => (finish = r)),
      google_login_paste: paste,
      sync_pull: () => ({ status: "empty" }),
      sync_push: () => ({ status: "uploaded" }),
    },
  });
  renderApp("/ajustes/sistema");
  await userEvent.click(await screen.findByRole("button", { name: "Iniciar sesión con Google" }));
  await userEvent.type(await screen.findByLabelText("Dirección de la página del navegador"), "http://127.0.0.1:1/?state=a&code=b");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(paste).toHaveBeenCalledWith({ url: "http://127.0.0.1:1/?state=a&code=b" });
});
