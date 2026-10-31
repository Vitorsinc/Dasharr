import { act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { AUTO_INSTALL_DELAY_S, resetUpdateState, runUpdateCheck } from "./useUpdates";
import { setPrefs } from "./usePrefs";

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(() => "t"), { loading: vi.fn(() => "l"), error: vi.fn(), dismiss: vi.fn() });
  return { toast };
});

vi.mock("@/lib/version", () => ({ isDevBuild: () => false }));

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
