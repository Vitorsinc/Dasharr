import { isSystemDisk, mergeDisks } from "./diskspace";

const TB = 1024 ** 4;

test("agrupa las rutas del mismo disco (Docker) y entre Radarr, Sonarr y qBittorrent", () => {
  const disks = mergeDisks(
    [
      {
        service: "radarr",
        disks: [
          { path: "/", freeSpace: 50e9, totalSpace: 100e9 },
          { path: "/config", freeSpace: 50e9, totalSpace: 100e9 },
          { path: "/data", freeSpace: 1 * TB, totalSpace: 4 * TB },
          { path: "/movies", label: "", freeSpace: 1 * TB, totalSpace: 4 * TB },
        ],
      },
      // Sonarr lo lee unos segundos después: el espacio libre ha cambiado un poco.
      {
        service: "sonarr",
        disks: [
          { path: "/data", freeSpace: 1 * TB - 2e9, totalSpace: 4 * TB },
          { path: "/tv", freeSpace: 1 * TB - 2e9, totalSpace: 4 * TB },
        ],
      },
    ],
    1 * TB - 3e9,
  );
  expect(disks).toHaveLength(2);
  expect(disks[0]).toMatchObject({ paths: ["/data", "/tv", "/movies"], total: 4 * TB, sources: ["radarr", "sonarr", "qbittorrent"] });
  expect(disks[0].label).toBeUndefined();
  expect(disks[1].paths).toEqual(["/", "/config"]);
  expect(isSystemDisk(disks[1])).toBe(true);
  expect(isSystemDisk(disks[0])).toBe(false);
});

test("discos distintos del mismo tamaño no se mezclan, y qBittorrent en otro disco sale aparte sin total", () => {
  const disks = mergeDisks(
    [
      {
        service: "radarr",
        disks: [
          { path: "/mnt/a", freeSpace: 1 * TB, totalSpace: 4 * TB },
          { path: "/mnt/b", freeSpace: 3 * TB, totalSpace: 4 * TB },
        ],
      },
    ],
    200e9,
  );
  expect(disks.map((d) => d.paths)).toEqual([["/mnt/a"], ["/mnt/b"], []]);
  expect(disks[2]).toMatchObject({ free: 200e9, sources: ["qbittorrent"] });
});

test("ignora respuestas inesperadas o servicios sin datos", () => {
  expect(
    mergeDisks(
      [
        { service: "radarr", disks: undefined },
        { service: "sonarr", disks: [{} as never] },
      ],
      undefined,
    ),
  ).toEqual([]);
});
