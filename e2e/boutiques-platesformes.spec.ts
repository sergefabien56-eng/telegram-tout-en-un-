import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Module « Boutiques & Plateformes ».
 *
 * Ce que le test vérifie, c'est la structure réelle du module : la section C
 * expose exactement quatre rubriques, et chaque carte de boutique propose
 * d'ajouter un produit avec la boutique présélectionnée.
 *
 * La publication des produits est couverte par
 * `e2e/publication-produit-jumia.spec.ts`.
 */

test.describe.serial("Boutiques & plateformes", () => {
  test("la section C expose exactement quatre rubriques", async ({ page }) => {
    const email = `boutiques-nav-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-NAV-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    await gotoSafely(page, "/dashboard");
    await page.waitForLoadState("networkidle");

    // Le module est affiché en majuscules (CSS) : on cible sans casse.
    const module = page
      .locator("aside[aria-label='Navigation principale'] button[aria-expanded]")
      .filter({ hasText: /boutiques et plateformes/i })
      .first();
    await module.click();

    const menu = page.locator("aside[aria-label='Navigation principale']");
    await expect(menu.getByRole("link", { name: "Toutes les boutiques", exact: true })).toHaveCount(
      1,
    );
    await expect(
      menu.getByRole("link", { name: "Ajouter une boutique Jumia", exact: true }),
    ).toHaveCount(1);
    await expect(menu.getByRole("link", { name: "Ajouter un produit", exact: true })).toHaveCount(
      1,
    );
    await expect(menu.getByText("Réseaux sociaux", { exact: true })).toHaveCount(1);

    // « Réseaux sociaux » est un emplacement « à venir » : aucun lien.
    await expect(page.getByRole("link", { name: "Réseaux sociaux" })).toHaveCount(0);

    // Les anciennes rubriques distinctes ne sont plus des entrées de menu.
    for (const libelle of ["Connexions Jumia", "Synchronisations", "Réglages boutiques"]) {
      await expect(
        page.locator("aside[aria-label='Navigation principale']").getByText(libelle),
      ).toHaveCount(0);
    }
  });

  test("chaque carte propose d'ajouter un produit avec la boutique présélectionnée", async ({
    page,
  }) => {
    const email = `boutiques-produit-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-PROD-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    const shopId = payload.data?.id;
    expect(shopId).toBeTruthy();

    await gotoSafely(page, "/boutiques");
    await page.waitForLoadState("domcontentloaded");

    // L'action est portée par la **carte** de la boutique (pas par le menu).
    const carte = page.locator("li", { hasText: "MA BOUTIQUE" }).first();
    const action = carte.getByRole("link", { name: "Ajouter un produit" });
    await expect(action).toBeVisible();
    await action.click();

    await expect(page).toHaveURL(new RegExp(`/boutiques/produits/nouveau\\?boutique=${shopId}`));
    await expect(page.getByRole("heading", { name: "Ajouter un produit" })).toBeVisible();
    // La boutique est présélectionnée : on ne la redemande pas.
    await expect(page.locator("main").getByLabel("Boutique")).toHaveValue(shopId ?? "");
  });
});
