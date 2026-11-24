import { defineConfig, devices } from "@playwright/test";

/**
 * Tests end-to-end (Phase 1+). Nécessite `npx playwright install`.
 * En CI, exécuter uniquement si les navigateurs sont installés.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    // Marge mémoire : la compilation à la volée de nombreuses pages fait
    // redémarrer le dev server sur le seuil par défaut.
    command: "NODE_OPTIONS=--max-old-space-size=1200 npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
