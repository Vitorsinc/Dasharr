import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorBell } from "./ErrorBell";
import { getErrors, reportError, resetErrors } from "@/lib/errorLog";
import { toast } from "@/lib/toast";

describe("ErrorBell", () => {
  beforeEach(resetErrors);

  it("enseña los errores y los quita al marcarlos como leídos", async () => {
    render(<ErrorBell />);
    act(() => {
      reportError("No se pudo conectar", "Radarr");
      toast.error("No se pudo borrar", { description: "403" });
    });
    await userEvent.click(screen.getByRole("button", { name: "Errores: 2 sin leer" }));
    expect(screen.getByText("No se pudo borrar · 403")).toBeInTheDocument();
    expect(screen.getByText("Radarr")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Marcar como leído" })[0]);
    expect(getErrors()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Marcar todos como leídos" }));
    expect(screen.getByText(/No hay errores/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Errores" })).toBeInTheDocument();
  });
});
