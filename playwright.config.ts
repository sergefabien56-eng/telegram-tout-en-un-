import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Bibliothèques système de Chromium, installées **sans root**.
 *
 * Le sandbox n'autorise pas l'installation de paquets système : les
 * bibliothèques dont Chromium a besoin (`libnspr4`, `libnss3`, `libatk`…)
 * sont donc extraites dans `~/.local/chromium-deps` par
 * `scripts/install-chromium-deps.sh`. On les ajoute au chemin de recherche
 * du chargeur pour que `npx playwright test` fonctionne tel quel.
 *
 * Si le dossier est absent, on ne fait rien : un environnement qui a les
 * bibliothèques système n'en a pas besoin.
 */
const DEPS_DIR = join(process.env.HOME ?? "/root", ".local", "chromium-deps");
const DEPS_LIBS = [
  join(DEPS_DIR, "usr/lib/x86_64-linux-gnu"),
  join(DEPS_DIR, "lib/x86_64-linux-gnu"),
].filter((path) => existsSync(path));

if (DEPS_LIBS.length > 0) {
  const current = process.env.LD_LIBRARY_PATH ?? "";
  process.env.LD_LIBRARY_PATH = [...DEPS_LIBS, current].filter(Boolean).join(":");
}

/**
 * Tests end-to-end (Phase 1+). Nécessite `npx playwright install`.
 * En CI, exécuter uniquement si les navigateurs sont installés.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Après la suite : on efface les comptes et boutiques de démonstration pour
  // qu'aucune donnée fictive ne reste en base (R1).
  globalTeardown: "./e2e/global-teardown.ts",
  // Le serveur de dev compile à la volée : on laisse une marge large.
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // On joue la suite sur le **build de production** : plus léger que le
    // serveur de dev (qui compile à la volée et sature la mémoire sur une
    // machine modeste), et plus réaliste — c'est exactement ce qui est
    // déployé. `E2E_USE_DEV=1` permet de revenir au serveur de dev.
    command: process.env.E2E_USE_DEV
      ? "NODE_OPTIONS=--max-old-space-size=900 npm run dev"
      : "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
