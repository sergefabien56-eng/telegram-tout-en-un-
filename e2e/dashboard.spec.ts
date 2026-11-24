import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/** Tableau de bord : les rubriques s'affichent, sans chiffre inventé. */
test("Le tableau de bord affiche les rubriques et l'état vide", async ({ page }) => {
  const email = `dash-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  // Une boutique réelle, sinon la page affiche son état vide et moins de rubriques.
  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-DASH-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await gotoSafely(page, "/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Tableau de bord", level: 1 })).toBeVisible();

  for (const titre of [
    "Vue d'ensemble",
    "Recherche dans mon espace",
    "Apparence",
    "Indicateurs financiers",
    "Performances globales",
    "Activités récentes",
    "Alertes importantes",
  ]) {
    await expect(page.getByRole("heading", { name: titre, exact: true })).toBeVisible();
  }

  // Sans relevé synchronisé, la rubrique financière le dit noir sur blanc.
  await expect(page.getByText(/Aucun relevé Jumia synchronisé/)).toBeVisible();
  await expect(page.getByText(/Aucune alerte prioritaire/)).toBeVisible();
});
