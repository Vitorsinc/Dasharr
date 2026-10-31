import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddMediaDialog } from "./AddMediaDialog";
import { t } from "@/i18n/es";

interface R {
  id: number;
  title: string;
}

function setup(lookup: (q: string) => Promise<R[]>) {
  render(
    <AddMediaDialog<R>
      open
      onOpenChange={() => {}}
      title="Añadir"
      lookup={lookup}
      toItem={(r) => ({ key: r.id, title: r.title, exists: false })}
      profiles={[]}
      rootFolders={[]}
      manualHint=""
      onAdd={async () => {}}
    />,
  );
  return screen.getByLabelText(t.library.lookupPlaceholder);
}

describe("AddMediaDialog búsqueda en vivo", () => {
  it("busca mientras se escribe, sin pulsar Enter, una sola vez tras la pausa", async () => {
    const lookup = vi.fn(async (q: string) => [{ id: 1, title: `Resultado ${q}` }]);
    const input = setup(lookup);
    fireEvent.change(input, { target: { value: "D" } });
    fireEvent.change(input, { target: { value: "Du" } });
    fireEvent.change(input, { target: { value: "Dune" } });
    expect((await screen.findAllByText("Resultado Dune")).length).toBeGreaterThan(0);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("Dune");
  });

  it("ignora la respuesta tardía de una búsqueda anterior", async () => {
    let resolveOld: (r: R[]) => void = () => {};
    const lookup = vi.fn((q: string) =>
      q === "Alien" ? new Promise<R[]>((res) => (resolveOld = res)) : Promise.resolve([{ id: 2, title: "Aliens nuevo" }]),
    );
    const input = setup(lookup);
    fireEvent.change(input, { target: { value: "Alien" } });
    await waitFor(() => expect(lookup).toHaveBeenCalledWith("Alien"));
    fireEvent.change(input, { target: { value: "Aliens" } });
    expect((await screen.findAllByText("Aliens nuevo")).length).toBeGreaterThan(0);
    resolveOld([{ id: 3, title: "Alien viejo" }]);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryAllByText("Alien viejo")).toHaveLength(0);
  });
});
