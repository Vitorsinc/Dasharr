import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

test("muestra la barra lateral y navega a Ajustes", async () => {
  render(<App />);
  for (const label of ["Inicio", "Películas", "Series", "Descargas", "Buscar", "Subtítulos", "Calendario", "Ajustes"]) {
    expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  }
  await userEvent.click(screen.getByRole("link", { name: "Ajustes" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
});

test("agrupa el menú por servicio y recuerda los grupos plegados", async () => {
  const { unmount } = render(<App />);
  const sonarr = screen.getByRole("button", { name: "Sonarr" });
  expect(sonarr).toHaveAttribute("aria-expanded", "true");
  await userEvent.click(sonarr);
  expect(screen.queryByRole("link", { name: "Anime" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Películas" })).toBeInTheDocument();
  unmount();

  render(<App />);
  expect(screen.getByRole("button", { name: "Sonarr" })).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(screen.getByRole("button", { name: "Sonarr" }));
  expect(screen.getByRole("link", { name: "Anime" })).toBeInTheDocument();
});
