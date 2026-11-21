import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";
import { getPrefs, setPrefs } from "@/hooks/usePrefs";
import { syncedPrefs } from "@/hooks/useGoogleSync";
import type { GoogleStatus } from "@/api/google";

const base: GoogleStatus = { available: true, signedIn: false, email: null, hasPassword: false, linked: false, lastSync: null };

test("sin identificador de Google lo explica", async () => {
  mockBackend({ commands: { google_status: () => ({ ...base, available: false }) } });
  renderApp("/ajustes/google");
  expect(await screen.findByText(/todavía no trae la conexión con Google/)).toBeInTheDocument();
});

test("inicia sesión, pide la contraseña y sube la configuración si no hay copia", async () => {
  let status = { ...base };
  const push = vi.fn(() => ({ status: "uploaded" }));
  mockBackend({
    commands: {
      google_status: () => status,
      google_login: () => {
        status = { ...status, signedIn: true, email: "yo@gmail.com" };
        return "yo@gmail.com";
      },
      sync_set_password: ({ password }: { password: string }) => {
        expect(password).toBe("una-clave-larga");
        status = { ...status, hasPassword: true };
      },
      sync_push: (args: { force: boolean }) => {
        status = { ...status, linked: true, lastSync: Date.now() };
        return push(args);
      },
    },
  });
  renderApp("/ajustes/google");
  await userEvent.click(await screen.findByRole("button", { name: "Iniciar sesión con Google" }));
  expect(await screen.findByText("Sesión iniciada como yo@gmail.com")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Contraseña de la copia"), "una-clave-larga");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(push.mock.calls[0][0]).toMatchObject({ force: false });
  expect(await screen.findByText(/Sincronizado automáticamente/)).toBeInTheDocument();
});

test("si ya hay copia pregunta y usa la de Google", async () => {
  let status = { ...base, signedIn: true, email: "yo@gmail.com", hasPassword: true };
  const pull = vi.fn(() => {
    status = { ...status, linked: true, lastSync: Date.now() };
    return { status: "applied", prefs: { theme: "light", sidebarCollapsed: ["x"] }, updatedAt: Date.now(), device: "Android" };
  });
  setPrefs({ theme: "dark", sidebarCollapsed: [] });
  mockBackend({
    commands: {
      google_status: () => status,
      sync_push: () => ({ status: "remoteNewer", updatedAt: Date.now(), device: "Android" }),
      sync_pull: pull,
    },
  });
  renderApp("/ajustes/google");
  expect(await screen.findByText("Ya hay una copia en tu cuenta de Google")).toBeInTheDocument();
  expect(screen.getByText(/Se guardó desde Android/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Usar la de Google en este dispositivo" }));
  await waitFor(() => expect(pull).toHaveBeenCalledWith({ force: true }));
  await waitFor(() => expect(getPrefs().theme).toBe("light"));
  // Lo que depende de la pantalla de cada dispositivo no viaja.
  expect(getPrefs().sidebarCollapsed).toEqual([]);
});

test("las preferencias de cada dispositivo no se suben", () => {
  setPrefs({ sidebarCollapsed: ["a"], downloadColumns: ["name"], releaseCountry: "MX" });
  const p = syncedPrefs();
  expect(p).not.toHaveProperty("sidebarCollapsed");
  expect(p).not.toHaveProperty("downloadColumns");
  expect(p.releaseCountry).toBe("MX");
});
