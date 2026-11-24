import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Section « Ventes et commandes » : les rubriques demandées sont dans le menu
 * déroulant, et chaque écran affiche un état honnête (aucune donnée fabriquée).
 */
test("Les rubriques Ventes et commandes sont accessibles depuis le menu", async ({ page }) => {
  // Six écrans à compiler à la volée par le serveur de dev : marge large.
  test.setTimeout(180_000);
  const email = `ventes-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-VENTES-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  await gotoSafely(page, "/dashboard");
  await page.waitForLoadState("networkidle");

  // La section contient les 7 rubriques.
  await page.getByRole("button", { name: "Ventes et commandes" }).click();
  for (const label of [
    "Toutes les commandes",
    "À traiter",
    "Expédiées",
    "Retours",
    "Factures originales",
    "Clients",
    "Exports",
  ]) {
    await expect(
      page.locator("aside[aria-label='Navigation principale']").getByRole("link", { name: label }),
    ).toBeVisible();
  }

  // Deux écrans chargés dans le navigateur (compilation à la volée lourde),
  // les autres rubriques sont vérifiées par requête HTTP ci-dessous.
  for (const [href, titre] of [
    ["/commandes/a-traiter", "À traiter"],
    ["/commandes/factures", "Factures originales"],
  ] as [string, string][]) {
    await gotoSafely(page, href);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: titre, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  }

  for (const href of [
    "/commandes/expediees",
    "/commandes/retours",
    "/commandes/clients",
    "/commandes/exports",
  ]) {
    const reponse = await page.request.get(href);
    expect(reponse.status(), `${href} doit répondre`).toBe(200);
  }

  // Factures : l'application ne fabrique aucun document.
  await gotoSafely(page, "/commandes/factures");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/ne renvoie pas les factures/i)).toBeVisible({ timeout: 30_000 });

  // Clients : état vide explicite, sans donnée personnelle inventée.
  await gotoSafely(page, "/commandes/clients");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Aucune commande enregistrée/i)).toBeVisible({ timeout: 30_000 });

  // Exports : cases à cocher + bouton de téléchargement.
  await gotoSafely(page, "/commandes/exports");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Télécharger le CSV" })).toBeVisible({
    timeout: 30_000,
  });
});

/** L'export multi-boutiques refuse une boutique hors du périmètre. */
test("L'export multi-boutiques reste borné aux boutiques autorisées", async ({ page }) => {
  const email = `export-scope-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const vide = (await (await page.request.get("/api/shops")).json()) as {
    ok: boolean;
    data: unknown[];
  };
  expect(vide.ok).toBe(true);
  expect(vide.data).toHaveLength(0);

  const intruse = "11111111-1111-1111-1111-111111111111";
  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-SCOPE-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });
  const reponse = await page.request.get(`/api/commandes/export?shopIds=${intruse}`);
  expect(reponse.status()).toBe(403);

  // Le périmètre sans boutique interdite reste exportable (CSV, en-têtes).
  const libre = await page.request.get("/api/commandes/export");
  expect(libre.status()).toBe(200);
  expect((await libre.text()).charCodeAt(0)).toBe(0xfeff);
});
