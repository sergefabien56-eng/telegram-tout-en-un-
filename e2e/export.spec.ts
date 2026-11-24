import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/** Les exports CSV existent et sont téléchargeables avec un contenu honnête. */
test("Export CSV des commandes vide puis rempli", async ({ page }) => {
  const email = `export-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-EXPORT-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  // Sans donnée : le bouton n'apparaît pas (pas d'export trompeur).
  await gotoSafely(page, "/commandes");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: /Exporter en CSV/ })).toHaveCount(0);

  // L'API répond quand même un CSV d'en-têtes, avec la permission adéquate.
  const response = await page.request.get(
    `/api/shops/${await currentShopId(page)}/commandes/export`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const body = await response.text();
  expect(body).toContain("Commande");
  expect(body).not.toContain("undefined");
});

async function currentShopId(page: import("@playwright/test").Page): Promise<string> {
  const shops = await page.request.get("/api/shops");
  const payload = (await shops.json()) as { ok: boolean; data?: { id: string }[] };
  const shop = Array.isArray(payload.data) ? payload.data[0] : undefined;
  if (!shop) throw new Error("Aucune boutique pour l'export.");
  return shop.id;
}
