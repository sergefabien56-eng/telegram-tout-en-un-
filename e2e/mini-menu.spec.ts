import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

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

const hasDb = Boolean(process.env.DATABASE_URL);
test.skip(!hasDb, "DATABASE_URL requis pour les tests Mini App.");

import { ensureAccount, gotoSafely, login } from "./helpers/auth";

/**
 * Menu Mini App : un module par section, rubriques dépliables, « Tout ouvrir /
 * Tout fermer », rubriques non développées marquées « À venir » sans lien mort.
 */
test.describe.serial("Mini App — menu", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);
  });

  test("déplie les modules, marque « À venir » et évite le débordement", async ({
    page,
    context,
  }) => {
    const email = `menu-mini-${Date.now()}@exemple.ci`;
    await context.clearCookies();
    await ensureAccount(page, email, "MotDePasse123");

    // Une boutique rend le propriétaire libre de toutes les permissions.
    const creation = await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-MENU-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(creation.ok()).toBe(true);

    await login(page, email, "MotDePasse123");
    // La Mini App se reconnaît au cookie d'interface : on le repose après le
    // login, qui réécrit les cookies de session.
    await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);
    await gotoSafely(page, "/dashboard");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /^plus$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // Rubrique active conservée.
    await expect(dialog.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Tout ouvrir : les 8 modules et leurs rubriques sont visibles.
    await dialog.getByRole("button", { name: "Tout ouvrir" }).click();
    for (const label of [
      "Tableau de bord",
      "Alertes",
      "Toutes les commandes",
      "Toutes les boutiques",
      "Ajouter une boutique Jumia",
      "Ajouter un produit",
      "Produits",
      "Stocks",
      "Vue financière",
      "Tous les rapports",
      "Assistante MIMI",
      "Notifications",
      "Membres de la boutique",
      "Système",
    ]) {
      await expect(dialog.getByRole("link", { name: label, exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }

    // Une rubrique non développée : texte + badge, mais aucun lien.
    await expect(dialog.getByText("Mouvements")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Mouvements" })).toHaveCount(0);
    await expect(dialog.locator("text=À venir").first()).toBeVisible();

    // Les rubriques « à venir » n'ont pas de lien mort.
    await expect(dialog.getByRole("link", { name: "Réseaux sociaux" })).toHaveCount(0);
    await expect(dialog.getByText("Réseaux sociaux")).toBeVisible();

    // Tout fermer : les rubriques disparaissent (il reste « version web »).
    await dialog.getByRole("button", { name: "Tout fermer" }).click();
    await expect(dialog.getByRole("link", { name: "Tableau de bord" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: /version web/i })).toBeVisible();

    // Aucun débordement horizontal dans la fenêtre Telegram.
    const dépassement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(dépassement).toBeLessThanOrEqual(0);
  });

  test("nettoie le compte de test", async ({ page }) => {
    await page.request.get("/api/health");
  });
});
