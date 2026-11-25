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

import { gotoSafely, login } from "./helpers/auth";

/**
 * Mini App — module « Ventes et commandes ».
 *
 * La Mini App consomme la même configuration de navigation que le web : les
 * quatre rubriques y apparaissent, la page active est marquée, et chaque
 * écran affiche son propre contenu.
 */
test.describe.serial("Mini App — Ventes et commandes", () => {
  const password = "MotDePasse123";

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);
  });

  test("le menu propose les quatre rubriques et marque la page active", async ({ page }) => {
    const email = `mini-ventes-${Date.now()}@exemple.ci`;
    await login(page, email, password);
    await page.request.post("/api/shops", {
      data: {
        name: "MINI VENTES",
        platform: "jumia",
        externalShopId: `E2E-MINI-V-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    await gotoSafely(page, "/commandes");
    await page.waitForLoadState("domcontentloaded");

    // Le menu « Plus » de la Mini App porte les quatre rubriques.
    const boutonPlus = page.getByRole("button", { name: /plus|plus d/i }).first();
    await boutonPlus.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible({ timeout: 30_000 });

    await menu.getByRole("button", { name: "Tout ouvrir" }).click();
    for (const label of ["Toutes les commandes", "À traiter", "Expédiées", "Villes & localités"]) {
      await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }

    // La page active est marquée.
    await expect(
      menu.getByRole("link", { name: "Toutes les commandes", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    // Aucun débordement horizontal dans la fenêtre Telegram.
    const dépassement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(dépassement).toBeLessThanOrEqual(0);
  });

  test("chaque rubrique s'ouvre sur son propre écran", async ({ page }) => {
    const email = `mini-ventes-pages-${Date.now()}@exemple.ci`;
    await login(page, email, password);
    await page.request.post("/api/shops", {
      data: {
        name: "MINI VENTES PAGES",
        platform: "jumia",
        externalShopId: `E2E-MINI-VP-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    for (const [href, titre] of [
      ["/commandes", "Toutes les commandes"],
      ["/commandes/a-traiter", "À traiter"],
      ["/commandes/expediees", "Expédiées"],
      ["/commandes/villes", "Villes & localités"],
    ] as [string, string][]) {
      await gotoSafely(page, href);
      await page.waitForLoadState("domcontentloaded");
      await expect(
        page.getByRole("heading", { name: titre, exact: true }).first(),
        `${href} doit porter son propre titre`,
      ).toBeVisible({ timeout: 30_000 });
    }
  });
});
