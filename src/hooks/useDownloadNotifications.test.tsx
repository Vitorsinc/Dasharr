import { act, screen } from "@testing-library/react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { mockBackend, renderApp } from "@/test/utils";

test("avisa cuando un torrent pasa a completado", async () => {
  let progress = 0.5;
  mockBackend({
    api: {
      qbittorrent: (req) =>
        req.path === "/api/v2/torrents/info" ? [{ hash: "h", name: "Peli.mkv", progress, state: progress < 1 ? "downloading" : "uploading" }] : {},
    },
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderApp("/");
  await screen.findByRole("link", { name: "Inicio" });
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(sendNotification).not.toHaveBeenCalled();
  progress = 1;
  await act(() => vi.advanceTimersByTimeAsync(2_500));
  expect(sendNotification).toHaveBeenCalledWith({ title: "Descarga completada", body: "Peli.mkv" });
  vi.useRealTimers();
});
