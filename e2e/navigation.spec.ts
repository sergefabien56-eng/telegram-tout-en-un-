import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * « Tout ouvrir / tout fermer » et le repli de la barre latérale : deux
 * réglages d'affichage, sans donnée fictive.
 */
test("La navigation se déplie et se replie", async ({ page }) => {
  const email = `nav-e2e-${Date.now()}@exemple.ci`;
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
  // Le serveur de dev compile à la volée : on attend la fin de l'hydratation
  // pour que les gestionnaires au clic soient bien attachés.
  await page.waitForLoadState("networkidle");

  // Une seule section est ouverte au départ (celle de la page courante).
  const sectionButtons = page.locator(
    "aside[aria-label='Navigation principale'] button[aria-expanded]",
  );
  const initialOpen = await sectionButtons.evaluateAll(
    (buttons) => buttons.filter((button) => button.getAttribute("aria-expanded") === "true").length,
  );
  expect(initialOpen).toBeLessThan(4);

  // Tout ouvrir.
  await page.getByRole("button", { name: "Tout ouvrir" }).click();
  const openedLabels = await page.getByRole("link", { name: "Toutes les commandes" }).count();
  expect(openedLabels).toBe(1);
  await expect(
    page.getByRole("link", { name: "Tous les rapports", exact: true }).first(),
  ).toBeVisible();

  // Tout fermer : les entrées de menu disparaissent.
  await page.getByRole("button", { name: "Tout fermer" }).click();
  await expect(page.getByRole("link", { name: "Toutes les commandes" })).toHaveCount(0);

  // Replier toute la barre latérale (bureau), puis la déployer.
  await page.getByRole("button", { name: "Replier le menu" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar", "rail");
  await page.getByRole("button", { name: "Déployer le menu" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar", "open");
});
