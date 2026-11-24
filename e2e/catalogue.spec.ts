import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Écrans Produits et Stocks : sans synchronisation, les pages affichent un
 * état vide explicite plutôt que des données inventées.
 */
test("Produits et Stocks affichent un état vide honnête", async ({ page }) => {
  const email = `catalogue-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-CATALOGUE-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await page.goto("/produits");
  await expect(page.getByRole("heading", { name: "Produits", level: 1 })).toBeVisible();
  await expect(page.getByText(/Aucun produit enregistré/)).toBeVisible();

  await page.goto("/stocks");
  await expect(page.getByRole("heading", { name: "Stocks", level: 1 })).toBeVisible();
  await expect(page.getByText(/Aucune déclinaison enregistrée/)).toBeVisible();
});
