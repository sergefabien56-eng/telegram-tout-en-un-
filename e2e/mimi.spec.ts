import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * MIMI sans clé IA : la page s'ouvre et l'assistante déclare son
 * indisponibilité au lieu d'inventer des chiffres.
 */
test("MIMI répond honnêtement quand aucune clé IA n'est configurée", async ({ page }) => {
  const email = `mimi-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-MIMI-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await gotoSafely(page, "/mimi");
  await expect(page.getByRole("heading", { name: "MIMI", level: 1 })).toBeVisible();

  await page.getByLabel("Votre question").fill("Quel est mon chiffre d'affaires ?");
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(page.getByText(/indisponible/i).first()).toBeVisible({ timeout: 30_000 });
});
