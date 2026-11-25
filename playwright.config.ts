import { defineConfig, devices } from "@playwright/test";

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
