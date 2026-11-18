import { screen, within } from "@testing-library/react";
import { mockBackend, renderApp } from "@/test/utils";
import { toServerSystem } from "@/api/beszel";

const GB = 1024 ** 3;

const system = {
  id: "sys1",
  name: "Vyrtubuntu",
  status: "up",
  info: { u: 3 * 86400 + 5 * 3600, cpu: 12.4, mp: 41.2, dp: 63.8, dt: 52, la: [0.42, 0.51, 0.6], bb: 2_000_000, v: "0.18.3", efs: { media: 91.3 } },
  updated: "2026-11-18 19:00:00.000Z",
};
const stats = {
  cpu: 12.4,
  mem: [32 * GB, 13.2 * GB, 4 * GB, 0],
  d: 500,
  du: 319,
  t: { cpu_thermal: 52, nvme0: 41 },
  efs: { media: { d: 8000, du: 7304 } },
  b: [250_000, 1_750_000],
};
const details = { hostname: "vyrtubuntu", kernel: "6.8.0-49-generic", os_name: "Ubuntu 24.04.1 LTS", arch: "x86_64", cpu: "Intel Core i5-12400", cores: 6, threads: 12 };

describe("Beszel", () => {
  it("combina el resumen, las medidas y los datos del equipo", () => {
    const s = toServerSystem(system, stats, details);
    expect(s.memory).toEqual({ pct: 41.2, used: 13.2 * GB, total: 32 * GB });
    expect(s.disk?.total).toBe(500 * GB);
    expect(s.disks).toEqual([{ name: "media", usage: { pct: 91.3, used: 7304 * GB, total: 8000 * GB } }]);
    expect(s.sensors[0]).toEqual({ name: "cpu_thermal", temp: 52 });
    expect(s.os).toBe("Ubuntu 24.04.1 LTS · 6.8.0-49-generic · x86_64");
    expect(s.netDown).toBe(1_750_000);
  });

  it("sirve con un Beszel antiguo, sin system_details ni medidas en bytes", () => {
    const old = toServerSystem({ ...system, info: { ...system.info, h: "viejo", k: "5.15", m: "Celeron", c: 4, os: 0 } }, { m: 8, mu: 2 }, null);
    expect(old.hostname).toBe("viejo");
    expect(old.cpuModel).toBe("Celeron");
    expect(old.os).toBe("Linux · 5.15");
    expect(old.memory?.total).toBe(8 * GB);
  });

  it("enseña el servidor en Inicio", async () => {
    mockBackend({
      api: {
        beszel: (req) => {
          if (req.path === "/api/beszel/info") return { v: "0.18.3" };
          if (req.path === "/api/collections/systems/records") return { items: [system] };
          if (req.path === "/api/collections/system_stats/records") return { items: [{ stats }] };
          if (req.path === "/api/collections/system_details/records/sys1") return details;
          throw { kind: "Http", status: 404, message: "" };
        },
      },
    });
    renderApp("/");
    const card = await screen.findByRole("article", { name: "Vyrtubuntu" });
    expect(within(card).getByText("En marcha")).toBeInTheDocument();
    expect(within(card).getByRole("group", { name: "CPU: 12 %" })).toBeInTheDocument();
    expect(within(card).getByRole("group", { name: "Temperatura: 52 °C" })).toBeInTheDocument();
    expect(within(card).getByText("media")).toBeInTheDocument();
    expect(within(card).getByText("3 d 5 h")).toBeInTheDocument();
  });
});
