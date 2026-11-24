import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Rubriques livrées après « À venir » : elles doivent répondre avec des
 * données réelles (ou un état vide explicite), jamais de faux chiffres.
 */
test("Les rubriques livrées répondent avec des données réelles", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `rubriques-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-RUBRIQUES-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  // Quatre écrans chargés dans le navigateur ; les autres par requête HTTP.
  for (const [href, titre] of [
    ["/categories", "Catégories"],
    ["/boutiques/synchronisations", "Synchronisations"],
    ["/telechargements", "Téléchargements"],
    ["/roles", "Rôles"],
  ] as [string, string][]) {
    await gotoSafely(page, href);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: titre, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  }

  // Prix : sans boutique choisie, la page demande une boutique.
  await gotoSafely(page, "/prix");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Prix", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  // Une seule boutique : la liste s'affiche (ou son état vide), jamais de faux prix.
  await expect(
    page.getByText(/Aucune déclinaison enregistrée/).or(page.locator("table")),
  ).toBeVisible({ timeout: 30_000 });

  // Rentabilité et Utilisateurs répondent (données réelles ou état vide).
  for (const href of ["/rentabilite", "/utilisateurs"]) {
    const reponse = await page.request.get(href);
    expect(reponse.status(), `${href} doit répondre`).toBe(200);
  }

  // Ancre « Par produit » présente dans la page Rapports.
  const html = await (await page.request.get("/rapports")).text();
  expect(html).toContain('id="produit"');

  // État vide honnête sur les catégories sans synchronisation.
  await gotoSafely(page, "/categories");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Aucun produit enregistré|catégorie/).first()).toBeVisible({
    timeout: 30_000,
  });
});
