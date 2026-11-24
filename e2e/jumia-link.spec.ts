import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Rattachement d'une boutique à une boutique Jumia.
 *
 * Les appels Jumia sont simulés (`page.route`) : CI n'a ni identifiants ni
 * réseau Jumia. On vérifie le parcours utilisateur, pas l'API distante.
 */
test("rattacher une boutique Jumia depuis la page Boutiques", async ({ page }) => {
  const email = `jumia-e2e-${Date.now()}@exemple.ci`;
  const password = "MotDePasse123";
  await login(page, email, password);

  const created = await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-JUMIA-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });
  const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
  if (!payload.ok || !payload.data) throw new Error("Création de boutique impossible en E2E.");
  const shopId = payload.data.id;

  let linked = false;
  await page.route("**/api/jumia/shops", async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        data: {
          shops: [
            {
              id: "remote-1",
              name: "NKSF Shop",
              countries: [{ code: "CI", name: "Jumia", status: "ACTIVE" }],
              linkedTo: linked ? { shopId, name: "MA BOUTIQUE" } : null,
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/shops/*/jumia-link", async (route) => {
    linked = true;
    await route.fulfill({
      json: {
        ok: true,
        data: {
          id: shopId,
          name: "MA BOUTIQUE",
          remoteShopId: "remote-1",
          remoteShopName: "NKSF Shop",
          status: "connected",
        },
      },
    });
  });

  await page.goto("/boutiques");

  await expect(page.getByRole("heading", { name: /Boutique Jumia rattachée/i })).toBeVisible();

  await page.selectOption("#jumia-shop-select", "remote-1");
  await page.getByRole("button", { name: "Rattacher" }).click();

  // Le message de confirmation provient du composant (les boutiques
  // réelles ne sont pas modifiées : l'appel POST est simulé).
  await expect(page.getByText("Boutique rattachée à Jumia.")).toBeVisible();
});
