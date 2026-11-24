import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Écran Commandes : en l'absence de synchronisation, la page doit l'indiquer
 * honnêtement plutôt que d'afficher des données inventées.
 */
test("l'écran Commandes affiche un état vide explicite", async ({ page }) => {
  const email = `commandes-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-COMMANDES-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await page.goto("/commandes");
  await expect(page.getByRole("heading", { name: "Commandes", level: 1 })).toBeVisible();
  await expect(page.getByText(/Aucune commande enregistrée/)).toBeVisible();
  // Le bouton est présent mais désactivé tant que la boutique n'est pas rattachée.
  await expect(page.getByRole("button", { name: /Synchroniser les commandes/ })).toBeDisabled();

  // L'entrée de navigation est-elle marquée « Bientôt disponible » ?
  // (Vérifié côté configuration par navigation.test.ts.)
});
