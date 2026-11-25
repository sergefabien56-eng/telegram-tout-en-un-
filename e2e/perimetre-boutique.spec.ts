import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * ISOLATION DU PÉRIMÈTRE — parcours réel.
 *
 * Trois règles doivent être vérifiées sur l'application, pas seulement en
 * théorie :
 * 1. sans filtre, la page ne montre qu'**une** boutique (celle courante) ;
 * 2. une boutique demandée qui n'est pas autorisée ne fait **jamais** élargir
 *    le périmètre vers toutes les boutiques ;
 * 3. l'agrégat « toutes les boutiques » reste accessible, mais seulement
 *    quand on le demande.
 */
test("le périmètre par défaut est une seule boutique et ne s'élargit jamais", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `perimetre-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const names = ["PERIMETRE ALPHA", "PERIMETRE BETA"];
  for (const name of names) {
    const created = await page.request.post("/api/shops", {
      data: {
        name,
        externalShopId: `E2E-PERIM-${name}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);
  }

  await gotoSafely(page, "/commandes");
  await page.waitForLoadState("networkidle");

  // 1. Une seule boutique par défaut.
  const filtre = page.locator("section select[name='boutique']").first();
  await expect(filtre).toBeVisible();
  const valeurParDefaut = await filtre.inputValue();
  expect(valeurParDefaut).not.toBe("toutes");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Filtre actif" })
      .filter({ hasText: /PERIMETRE/ }),
  ).toBeVisible();

  // 2. Une boutique étrangère au périmètre ne fait pas retomber sur toutes.
  const intruse = crypto.randomUUID();
  await gotoSafely(page, `/commandes?boutique=${intruse}`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("alert").filter({ hasText: /n['’]est pas dans votre périmètre/ }),
  ).toBeVisible();
  // Aucune donnée ne doit être affichée pour ce périmètre refusé.
  await expect(page.getByRole("cell", { name: /PERIMETRE/ })).toHaveCount(0);

  // 3. L'agrégat reste possible, mais il faut le demander.
  await gotoSafely(page, "/commandes?boutique=toutes");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("status").filter({ hasText: "Filtre actif" }).filter({ hasText: "toutes" }),
  ).toBeVisible();
});
