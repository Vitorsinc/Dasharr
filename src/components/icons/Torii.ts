import { createLucideIcon } from "lucide-react";

/** Puerta torii, para Anime: Lucide no trae ningún icono que remita a Japón. */
export const Torii = createLucideIcon("Torii", [
  ["path", { d: "M3 4.5c4 1.3 14 1.3 18 0", key: "kasagi" }],
  ["path", { d: "M5 9h14", key: "nuki" }],
  ["path", { d: "M12 5.8V9", key: "gakuzuka" }],
  ["path", { d: "M7 5.6V21", key: "left" }],
  ["path", { d: "M17 5.6V21", key: "right" }],
]);
