// Comprueba que la etiqueta coincide con la versión del proyecto y escribe las notas de esa versión desde CHANGELOG.md.
// Uso (en CI): node scripts/release-notes.mjs v0.2.0 > notas.md
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const version = tag.replace(/^v/, "");
const read = (f) => readFileSync(f, "utf8");
const found = {
  "package.json": JSON.parse(read("package.json")).version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1],
  "crates/dasharr-core/Cargo.toml": read("crates/dasharr-core/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1],
};
const wrong = Object.entries(found).filter(([, v]) => v !== version);
if (wrong.length) {
  console.error(`La etiqueta ${tag} no coincide con: ${wrong.map(([f, v]) => `${f} (${v})`).join(", ")}`);
  process.exit(1);
}

const changelog = read("CHANGELOG.md");
const start = changelog.indexOf(`## [${version}]`);
if (start < 0) {
  console.error(`CHANGELOG.md no tiene la sección [${version}]`);
  process.exit(1);
}
const rest = changelog.slice(start).split("\n").slice(1);
const end = rest.findIndex((l) => l.startsWith("## ["));
const notes = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
console.log(`${notes}\n\n---\nDescarga el instalador \`.exe\` (recomendado) o \`.msi\` de abajo.`);
