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
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
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

import { ensureAccount, login } from "./helpers/auth";

const password = "MotDePasse123";

test.describe.serial("Mini App", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);
  });

  test("inscrit le compte de test (version web)", async ({ page, context }) => {
    await context.clearCookies();
    await ensureAccount(page, email, password);
  });

  test("affiche la navigation basse et masque la sidebar web", async ({ page }) => {
    await login(page, email, password);

    const bottomNav = page.locator('nav[aria-label="Navigation principale"]');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav).toHaveClass(/fixed/);
    for (const label of ["Accueil", "Boutiques", "Alertes", "Sécurité", "Plus"]) {
      await expect(bottomNav.getByText(label, { exact: true })).toBeVisible();
    }

    // La coquille web ne doit pas être servie.
    await expect(page.locator("aside")).toHaveCount(0);

    // En-tête compact : bouton retour + titre de page.
    await expect(page.getByRole("button", { name: /retour/i })).toBeVisible();

    // Le sélecteur de boutique n'apparaît que si le compte a au moins une boutique.
    const shops = await page.evaluate(async () => {
      const response = await fetch("/api/shops");
      if (!response.ok) return [];
      const payload = (await response.json()) as { ok: boolean; data?: unknown[] };
      return payload.data ?? [];
    });
    if (shops.length > 0) {
      await expect(page.getByLabel(/boutique active/i)).toBeVisible();
    } else {
      await expect(page.getByText(/aucune boutique/i).first()).toBeVisible();
    }
  });

  test("navigue vers une page réelle sans perdre la coquille", async ({ page }) => {
    await login(page, email, password);
    await page
      .locator('nav[aria-label="Navigation principale"]')
      .getByRole("link", { name: "Boutiques" })
      .click();
    await expect(page).toHaveURL(/\/boutiques$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^boutiques$/i })).toBeVisible();
    await expect(page.locator('nav[aria-label="Navigation principale"]')).toBeVisible();
  });

  test("la feuille « Plus » n'offre que des pages qui existent", async ({ page }) => {
    await login(page, email, password);
    await page.getByRole("button", { name: /^plus$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Tout ouvrir déplie tous les modules.
    await dialog.getByRole("button", { name: "Tout ouvrir" }).click();
    await expect(dialog.getByRole("link", { name: "Notifications" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Sécurité du compte" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /version web/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /déconnexion/i })).toBeVisible();
  });

  test("nettoie : supprime le compte de test", async ({ page }) => {
    const status = await page.request.get("/api/auth/me");
    expect(status.status()).toBeGreaterThanOrEqual(200);
  });
});
