import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * L'écran Synchronisations est borné à une boutique par défaut (isolation) et
 * permet d'élargir explicitement le périmètre à toutes les boutiques du
 * compte. Chaque boutique a son propre bouton de synchronisation.
 */
test("Synchronisations liste la boutique courante puis permet l'agrégat explicite", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `sync-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const names = ["NKSF SHOP", "MaxiShopsCI"];
  for (const name of names) {
    const created = await page.request.post("/api/shops", {
      data: {
        name,
        externalShopId: `E2E-SYNC-${name}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);
  }

  await gotoSafely(page, "/boutiques/synchronisations");
  await page.waitForLoadState("networkidle");

  // Par défaut, une seule boutique est affichée : c'est la boutique courante.
  // Les autres ne sont pas mélangées dans le tableau.
  const cellules = page.getByRole("cell", { name: /NKSF SHOP|MaxiShopsCI/, exact: true });
  await expect(cellules).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Tout synchroniser" })).toHaveCount(1);

  // L'agrégat reste accessible, mais il doit être demandé explicitement.
  const select = page.locator("section select[name='boutique']").first();
  await select.selectOption("toutes");
  await page.waitForURL(/boutique=toutes/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  for (const name of names) {
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }

  // Un bouton de synchronisation par boutique (les deux sont hors Jumia :
  // le bouton doit rester désactivé tant que le rattachement n'est pas fait).
  const boutons = page.getByRole("button", { name: "Tout synchroniser" });
  await expect(boutons).toHaveCount(2);
  await expect(boutons.first()).toBeDisabled();
});

/** La synchronisation complète est refusée pour une boutique qui n'est pas la sienne. */
test("la synchronisation complète est refusée hors périmètre", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `sync-deny-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const created = await page.request.post("/api/shops", {
    data: {
      name: "BOUTIQUE AUTRE",
      externalShopId: `E2E-DENY-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });
  const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
  const shopId = payload.data?.id;
  expect(shopId).toBeTruthy();

  const unknown = await page.request.post(`/api/shops/${crypto.randomUUID()}/sync`, {
    data: { days: 30 },
  });
  expect(unknown.status()).toBe(404);
});
