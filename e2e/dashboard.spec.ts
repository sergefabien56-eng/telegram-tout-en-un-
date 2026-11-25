import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Tableau de bord : un centre de pilotage, sans chiffre inventé.
 *
 * Refonte : les sept rubriques sont devenues des **pages** distinctes
 * (`/alertes`, `/performances`, `/activites`, `/recherche`, `/apparence`).
 * Le tableau de bord garde l'essentiel et **annonce son périmètre**.
 */
test("Le tableau de bord affiche ses indicateurs et son périmètre", async ({ page }) => {
  const email = `dash-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  // Une boutique réelle, sinon la page affiche son état vide.
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

  // Le périmètre affiché est annoncé : c'est ce qui manquait.
  const scope = page.getByTestId("scope-bar");
  await expect(scope).toContainText("MA BOUTIQUE");
  await expect(scope).toContainText("30 jours");

  // Les indicateurs clés sont là, avec leur source.
  await expect(page.getByText("CA commandes", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Articles vendus", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Stocks faibles", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Net à verser (Jumia)", { exact: true }).first()).toBeVisible();

  // Sans relevé synchronisé, le net à verser le dit noir sur blanc.
  await expect(page.getByText(/Aucun relevé synchronisé/)).toBeVisible();

  // Aucune alerte : l'état est explicite, jamais un vide trompeur.
  await expect(page.getByText(/Aucune alerte sur les données enregistrées/)).toBeVisible();

  // Les accès rapides mènent à des pages réelles.
  await expect(page.getByRole("link", { name: /Commandes à traiter/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Relevés et versements/ })).toBeVisible();
});
