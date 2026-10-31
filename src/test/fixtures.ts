import type { QualityProfileFull } from "@/api/arrManage";

const q = (id: number, name: string, allowed: boolean) => ({ quality: { id, name }, items: [], allowed });
/** Perfil de calidad de Radarr/Sonarr de ejemplo, con un grupo y dos formatos. */
export function profile(): QualityProfileFull {
  return {
    id: 4,
    name: "HD",
    upgradeAllowed: true,
    cutoff: 7,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    formatItems: [
      { format: 1, name: "x265", score: 0 },
      { format: 2, name: "HDR", score: 10 },
    ],
    // De peor a mejor, como lo guarda el *arr.
    items: [
      q(1, "SDTV", false),
      { id: 1000, name: "WEB 720p", items: [q(5, "WEBDL-720p", true), q(14, "WEBRip-720p", true)], allowed: true },
      q(7, "Bluray-1080p", true),
      q(19, "Bluray-2160p", false),
    ],
  };
}

