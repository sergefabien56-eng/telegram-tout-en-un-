import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Charge `.env.local` pour les tests (Vitest ne le fait pas nativement).
 * En CI, DATABASE_URL est absent : les tests d'intégration sont ignorés.
 */
function loadEnvLocal() {
  const path = fileURLToPath(new URL("./.env.local", import.meta.url));
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
    globals: false,
    reporters: "default",
    // Les tests d'intégration s'appuient sur la **base réelle** : ils doivent
    // être sérialisés, sinon un fichier qui écrit pendant qu'un autre lit
    // produit des totaux incohérents (et des faux échecs).
    fileParallelism: false,
    // Les tests unitaires sont instantanés ; ceux qui lisent la base réelle
    // ont besoin de quelques secondes. 20 s les couvre sans ralentir la
    // détection d'un blocage (en CI, ils sont ignorés : pas de base).
    testTimeout: 20_000,
  },
});
