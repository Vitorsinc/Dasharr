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
