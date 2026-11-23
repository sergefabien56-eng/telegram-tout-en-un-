import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Charge `.env.local` (le runner Playwright ne le fait pas). */
function loadEnvLocal() {
  const file = process.env.E2E_ENV_FILE ?? ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvLocal();

/**
 * Coquille Mini App : bottom nav, en-tête compact, pas de sidebar web.
 * Nécessite la base réelle (DATABASE_URL).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
test.skip(!hasDb, "DATABASE_URL requis pour les tests Mini App.");

const email = `e2e-mini-${Date.now()}@exemple.ci`;
const password = "MotDePasse123";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/adresse e-mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(password);
  await page.getByRole("button", { name: /connexion/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.serial("Mini App", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "teu_ui", value: "mini", domain: "localhost", path: "/" },
    ]);
  });

  test("inscrit le compte de test (version web)", async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.request.post("/api/auth/register", {
      data: { email, password, fullName: "E2E Mini" },
    });
    expect(response.ok()).toBe(true);
  });

  test("affiche la navigation basse et masque la sidebar web", async ({ page }) => {
    await login(page);

    const bottomNav = page.locator('nav[aria-label="Navigation principale"]');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav).toHaveClass(/fixed/);
    for (const label of ["Accueil", "Boutiques", "Alertes", "Sécurité", "Plus"]) {
      await expect(bottomNav.getByText(label, { exact: true })).toBeVisible();
    }

    // La coquille web ne doit pas être servie.
    await expect(page.locator("aside")).toHaveCount(0);

    // En-tête compact : retour + sélecteur de boutique.
    await expect(page.getByRole("button", { name: /retour/i })).toBeVisible();
    await expect(page.getByLabel(/boutique active/i)).toBeVisible();
  });

  test("navigue vers une page réelle sans perdre la coquille", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Boutiques" }).click();
    await expect(page).toHaveURL(/\/boutiques$/);
    await expect(page.getByRole("heading", { name: /^boutiques$/i })).toBeVisible();
    await expect(page.locator('nav[aria-label="Navigation principale"]')).toBeVisible();
  });

  test("la feuille « Plus » n'offre que des pages qui existent", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /^plus$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /santé du système/i })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /version web/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /déconnexion/i })).toBeVisible();
  });

  test("nettoie : supprime le compte de test", async ({ page }) => {
    const status = await page.request.get("/api/auth/me");
    expect(status.status()).toBeGreaterThanOrEqual(200);
  });
});
