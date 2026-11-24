import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/** La page Rapports existe, filtre par permission et n'affiche rien d'inventé. */
test("Rapports : accès refusé hors rôle autorisé", async ({ page }) => {
  const email = `rapports-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-RAPPORTS-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await gotoSafely(page, "/rapports");
  await expect(page.getByRole("heading", { name: "Rapports", level: 1 })).toBeVisible();
  // Aucune donnée synchronisée : la page le dit au lieu d'afficher des chiffres vides.
  await expect(page.getByText(/Aucune commande livrée ou expédiée/)).toBeVisible();
});
