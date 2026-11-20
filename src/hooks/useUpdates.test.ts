import { act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { AUTO_INSTALL_DELAY_S, CHECK_EVERY_MS, DEV_CHECK_EVERY_MS, checkDue, resetUpdateState, runUpdateCheck } from "./useUpdates";
import { setPrefs } from "./usePrefs";

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(() => "t"), { loading: vi.fn(() => "l"), error: vi.fn(), dismiss: vi.fn() });
  return { toast };
});

const build = vi.hoisted(() => ({ dev: false }));
vi.mock("@/lib/version", () => ({ isDevBuild: () => build.dev }));

const update = {
  version: "0.2.0",
  notes: "",
  installerUrl: "https://github.com/Vitorsinc/Dasharr/releases/download/v0.2.0/a-setup.exe",
  checksumUrl: null,
};

function backend(found: typeof update | null) {
  const mock = vi.mocked(invoke);
  mock.mockReset();
  mock.mockImplementation(async (cmd: string) => (cmd === "check_update" ? found : new Promise(() => {})));
  return mock;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetUpdateState();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  resetUpdateState();
  setPrefs({ autoUpdate: true });
  build.dev = false;
  vi.useRealTimers();
});

test("con la instalación automática activada, la instala sola tras el margen", async () => {
  const mock = backend(update);
  await runUpdateCheck({ manual: false });
  expect(toast).toHaveBeenCalledWith(expect.stringContaining("Se instalará sola"), expect.anything());
  expect(mock).not.toHaveBeenCalledWith("install_update", expect.anything());
  await act(() => vi.advanceTimersByTimeAsync(AUTO_INSTALL_DELAY_S * 1000));
  expect(mock).toHaveBeenCalledWith("install_update", { installerUrl: update.installerUrl, checksumUrl: null });
});

test("«Más tarde» cancela la instalación y no vuelve a insistir con la misma versión", async () => {
  const mock = backend(update);
  await runUpdateCheck({ manual: false });
  const opts = vi.mocked(toast).mock.calls[0][1] as unknown as { cancel: { onClick: () => void } };
  opts.cancel.onClick();
  await act(() => vi.advanceTimersByTimeAsync(AUTO_INSTALL_DELAY_S * 1000));
  expect(mock).not.toHaveBeenCalledWith("install_update", expect.anything());
  vi.mocked(toast).mockClear();
  await runUpdateCheck({ manual: false });
  expect(toast).not.toHaveBeenCalled();
});

test("con la instalación automática desactivada solo avisa", async () => {
  setPrefs({ autoUpdate: false });
  const mock = backend(update);
  await runUpdateCheck({ manual: false });
  expect(toast).toHaveBeenCalledWith("Hay una versión nueva de Dasharr: v0.2.0", expect.anything());
  await act(() => vi.advanceTimersByTimeAsync(AUTO_INSTALL_DELAY_S * 1000));
  expect(mock).not.toHaveBeenCalledWith("install_update", expect.anything());
});

test("sin versión nueva no avisa", async () => {
  backend(null);
  expect(await runUpdateCheck({ manual: false })).toBeNull();
  expect(toast).not.toHaveBeenCalled();
});

test("la versión publicada mira el canal estable", async () => {
  const mock = backend(null);
  await runUpdateCheck({ manual: false });
  expect(mock).toHaveBeenCalledWith("check_update", { dev: false, build: expect.any(String) });
});

test("Dasharr Dev sigue la versión de prueba y se actualiza sola", async () => {
  build.dev = true;
  const mock = backend({ ...update, version: "0.2.0 · dev abc1234" });
  await runUpdateCheck({ manual: false });
  expect(mock).toHaveBeenCalledWith("check_update", { dev: true, build: expect.any(String) });
  await act(() => vi.advanceTimersByTimeAsync(AUTO_INSTALL_DELAY_S * 1000));
  expect(mock).toHaveBeenCalledWith("install_update", expect.anything());
});

test("el canal dev se comprueba cada 10 minutos y el estable cada 6 horas", async () => {
  backend(null);
  await runUpdateCheck({ manual: false });
  const now = Date.now();
  expect(checkDue(now + DEV_CHECK_EVERY_MS)).toBe(false);
  expect(checkDue(now + CHECK_EVERY_MS)).toBe(true);
  build.dev = true;
  expect(checkDue(now + DEV_CHECK_EVERY_MS)).toBe(true);
});
