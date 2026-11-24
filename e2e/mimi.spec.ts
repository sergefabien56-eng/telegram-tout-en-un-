import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * MIMI ne doit jamais inventer de chiffre. Deux cas possibles ici :
 * - clé IA absente → message d'indisponibilité explicite ;
 * - clé IA présente → réponse réelle, qui cite ses sources ou dit que la
 *   boutique n'a aucune commande enregistrée.
 */
test("MIMI ne fabrique aucun chiffre sans donnée", async ({ page }) => {
  test.setTimeout(120_000);
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

  await expect(
    page.getByText(/indisponible|aucune commande|données enregistrées/i).first(),
  ).toBeVisible({ timeout: 90_000 });
});
