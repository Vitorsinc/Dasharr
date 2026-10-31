/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));
// En GitHub Actions: las builds de una etiqueta v* o del flujo Release (DASHARR_RELEASE) son versiones publicadas;
// el resto, builds de desarrollo con su commit.
const isRelease = process.env.GITHUB_REF_TYPE === "tag" || process.env.DASHARR_RELEASE === "1";
// En local se usa el commit de git (con "+" si hay cambios sin commitear), para saber qué versión se está viendo.
function localBuild() {
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() !== "";
    return dirty ? `${sha}+` : sha;
  } catch {
    return "local";
  }
}
const build = isRelease ? "" : process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : localBuild();

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**"] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
