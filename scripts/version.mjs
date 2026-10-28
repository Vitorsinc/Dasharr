// Cambia la versión de Dasharr en todos los sitios a la vez y cierra la sección "Sin publicar" del CHANGELOG.
// Uso: npm run version:set -- 0.2.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Uso: npm run version:set -- X.Y.Z (versionado semántico)");
  process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
const json = (file, fn) => edit(file, (s) => JSON.stringify(fn(JSON.parse(s)), null, 2) + "\n");

json("package.json", (p) => ({ ...p, version }));
json("package-lock.json", (p) => {
  p.version = version;
  if (p.packages?.[""]) p.packages[""].version = version;
  return p;
});
json("src-tauri/tauri.conf.json", (p) => ({ ...p, version }));
for (const toml of ["src-tauri/Cargo.toml", "crates/dasharr-core/Cargo.toml"])
  edit(toml, (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));

const today = new Date().toISOString().slice(0, 10);
edit("CHANGELOG.md", (s) => {
  if (!s.includes("## [Sin publicar]")) throw new Error("CHANGELOG.md no tiene sección [Sin publicar]");
  return s.replace("## [Sin publicar]", `## [Sin publicar]\n\n## [${version}] - ${today}`);
});

console.log(`Versión ${version}. Ahora: cargo update -p dasharr -p dasharr-core, commit y etiqueta v${version}.`);
