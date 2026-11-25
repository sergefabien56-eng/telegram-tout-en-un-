import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Section « Ventes et commandes » — refonte en **quatre rubriques**.
 *
 * A. Toutes les commandes (Historique, Annulées, Exporter)
 * B. À traiter (En attente, Prêtes à expédier, Factures à imprimer)
 * C. Expédiées (Expédiées, Retours)
 * D. Villes & localités
 *
 * Chaque rubrique et chaque sous-vue a sa propre page et son propre contenu ;
 * aucune n'est la copie d'une autre.
 */
test("Le menu Ventes et commandes propose exactement quatre rubriques", async ({ page }) => {
  // Plusieurs écrans à compiler à la volée par le serveur de dev : marge large.
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

  const menu = page.locator("aside[aria-label='Navigation principale']");
  await page.getByRole("button", { name: "Ventes et commandes" }).click();

  for (const label of ["Toutes les commandes", "À traiter", "Expédiées", "Villes & localités"]) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  // Les anciennes entrées de menu ne sont plus des rubriques principales.
  for (const label of ["Retours", "Factures originales", "Clients", "Exports"]) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }
});

test("Chaque rubrique a sa propre page et son propre titre", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `ventes-pages-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-VENTES-P-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  for (const [href, titre] of [
    ["/commandes", "Toutes les commandes"],
    ["/commandes/annulees", "Commandes annulées"],
    ["/commandes/a-traiter", "À traiter"],
    ["/commandes/a-traiter/en-attente", "En attente"],
    ["/commandes/a-traiter/pretes-a-expedier", "Prêtes à expédier"],
    ["/commandes/a-traiter/factures", "Factures à imprimer"],
    ["/commandes/expediees", "Expédiées"],
    ["/commandes/retours", "Retours"],
    ["/commandes/villes", "Villes & localités"],
  ] as [string, string][]) {
    const reponse = await page.request.get(href);
    expect(reponse.status(), `${href} doit répondre`).toBe(200);
    await gotoSafely(page, href);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: titre, exact: true }).first(),
      `${href} doit porter son propre titre`,
    ).toBeVisible({ timeout: 30_000 });
  }
});

test("L'ancienne adresse des factures redirige vers sa nouvelle destination", async ({ page }) => {
  const email = `ventes-redir-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");
  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-VENTES-R-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  const reponse = await page.request.get("/commandes/factures", { maxRedirects: 0 });
  expect([301, 308]).toContain(reponse.status());

  await gotoSafely(page, "/commandes/factures");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Factures à imprimer" })).toBeVisible({
    timeout: 30_000,
  });
});

test("Les fonctions déplacées restent accessibles", async ({ page }) => {
  const email = `ventes-deplace-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");
  await page.request.post("/api/shops", {
    data: {
      name: "MA BOUTIQUE",
      platform: "jumia",
      externalShopId: `E2E-VENTES-D-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  // Clients : état vide explicite, sans donnée personnelle inventée.
  await gotoSafely(page, "/commandes/clients");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Clients", exact: true, level: 1 })).toBeVisible({
    timeout: 30_000,
  });

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
