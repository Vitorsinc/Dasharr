import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockBackend, renderApp } from "@/test/utils";

test("muestra el registro y filtra por errores", async () => {
  mockBackend({
    commands: {
      read_log: () => ({
        path: "C:\\logs\\dasharr.log",
        lines: [
          "[2026-10-28][18:30:00][dasharr_lib][INFO] Dasharr 0.2.0 iniciado",
          "[2026-10-28][18:30:01][dasharr_core::client][ERROR] bazarr GET /api/system/status -> credenciales incorrectas (12 ms)",
        ],
      }),
    },
  });
  renderApp("/registro");
  expect(await screen.findByRole("link", { name: "Registro" })).toHaveAttribute("aria-current", "page");
  expect(await screen.findByText(/bazarr GET \/api\/system\/status/)).toBeInTheDocument();
  expect(screen.getByText("Dasharr 0.2.0 iniciado")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Errores" }));
  expect(screen.queryByText("Dasharr 0.2.0 iniciado")).not.toBeInTheDocument();
  expect(screen.getByText(/C:\\logs\\dasharr.log/)).toBeInTheDocument();
});
