import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import App from "@/App";
import { isMobile } from "@/lib/platform";

function narrowScreen() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

test("en el móvil hay barra inferior y el menú completo se abre en un panel", async () => {
  narrowScreen();
  render(<App />);
  const bar = screen.getByRole("navigation", { name: "Navegación" });
  for (const label of ["Inicio", "Películas", "Series", "Descargas"]) {
    expect(within(bar).getByRole("link", { name: label })).toBeInTheDocument();
  }
  // Sin barra lateral: «Buscar» solo está dentro del panel.
  expect(screen.queryByRole("link", { name: "Buscar" })).not.toBeInTheDocument();
  await userEvent.click(within(bar).getByRole("button", { name: "Menú" }));
  const panel = await screen.findByRole("dialog", { name: "Menú" });
  await userEvent.click(within(panel).getByRole("link", { name: "Ajustes" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Menú" })).not.toBeInTheDocument();
});

test("reconoce el navegador de Android", () => {
  expect(isMobile("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe(true);
  expect(isMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0")).toBe(false);
});
