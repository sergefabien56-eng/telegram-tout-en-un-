import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/** Administration : uniquement des agrégats réels, filtrés par boutique accessible. */
test("Administration affiche les vraies boutiques et les rôles", async ({ page }) => {
  const email = `admin-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-ADMIN-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await gotoSafely(page, "/admin");
  await expect(page.getByRole("heading", { name: "Administration", level: 1 })).toBeVisible();
  await expect(page.getByText(/1 boutique\(s\), 1 membre\(s\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membres par rôle", level: 2 })).toBeVisible();
});
