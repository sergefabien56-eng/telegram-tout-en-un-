import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * La boutique affichée doit être celle choisie par le vendeur, partout.
 *
 * Régression : le sélecteur de l'en-tête affichait toujours la première
 * boutique de la liste alors que les pages montraient celle choisie dans le
 * cookie. Le vendeur croyait donc regarder NKSF SHOP pendant que l'écran
 * affichait Maxi Shops (et inversement).
 */
test("le sélecteur de boutique conserve la boutique choisie", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `selection-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const ids: string[] = [];
  for (const name of ["BOUTIQUE ALPHA", "BOUTIQUE BETA"]) {
    const created = await page.request.post("/api/shops", {
      data: {
        name,
        externalShopId: `E2E-SEL-${name}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    expect(payload.ok).toBe(true);
    ids.push(payload.data?.id ?? "");
  }
  const [alphaId, betaId] = ids;

  await gotoSafely(page, "/dashboard");
  // Le serveur de dev compile à la volée : on attend l'hydratation React pour
  // que le gestionnaire de changement du sélecteur soit bien attaché.
  await page.waitForLoadState("networkidle");

  const headerSelect = page.locator("header select").first();
  await expect(headerSelect).toBeVisible();

  // On choisit BOUTIQUE ALPHA puis on recharge : l'en-tête doit toujours
  // annoncer la boutique choisie.
  await headerSelect.selectOption(alphaId);
  await page.waitForTimeout(1500);
  await gotoSafely(page, "/dashboard");
  await expect(page.locator("header select").first()).toHaveValue(alphaId);

  // Idem pour la seconde boutique : on attend de nouveau l'hydratation après
  // le rechargement, sinon le gestionnaire de changement n'est pas attaché et
  // la sélection n'est jamais enregistrée.
  await page.waitForLoadState("networkidle");
  await page.locator("header select").first().selectOption(betaId);
  await page.waitForTimeout(1500);
  await gotoSafely(page, "/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("header select").first()).toHaveValue(betaId);
});

/**
 * Le filtre « Boutique » s'applique immédiatement et la page dit quelle
 * boutique est affichée.
 */
test("le filtre boutique s'applique immédiatement et affiche la boutique active", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `filtre-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const ids: string[] = [];
  for (const name of ["FILTRE ALPHA", "FILTRE BETA"]) {
    const created = await page.request.post("/api/shops", {
      data: {
        name,
        externalShopId: `E2E-FILTRE-${name}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    ids.push(payload.data?.id ?? "");
  }
  const [alphaId] = ids;

  await gotoSafely(page, "/commandes");
  // Hydratation React attendue : sans elle, le changement de boutique n'est
  // pas appliqué (navigation côté client).
  await page.waitForLoadState("networkidle");
  const filtre = page.locator("section select[name='boutique']").first();
  await expect(filtre).toBeVisible();

  await filtre.selectOption(alphaId);
  await page.waitForURL(new RegExp(`boutique=${alphaId}`), { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Filtre actif" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "FILTRE ALPHA" })).toBeVisible();
});

/**
 * La synchronisation des commandes vise la boutique choisie, jamais « la
 * première » par défaut.
 */
test("la synchronisation des commandes annonce la boutique cible", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `sync-cible-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  for (const name of ["SYNC ALPHA", "SYNC BETA"]) {
    const created = await page.request.post("/api/shops", {
      data: {
        name,
        externalShopId: `E2E-SYNCCIBLE-${name}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);
  }

  await gotoSafely(page, "/commandes");
  await page.waitForLoadState("networkidle");
  // Le panneau de synchronisation annonce la boutique cible : il ne vise
  // jamais « la première » boutique par défaut.
  await expect(page.getByRole("button", { name: /Synchroniser cette période/ })).toBeVisible();
  await expect(page.getByText(/La synchronisation porte sur la boutique choisie/)).toBeVisible();
  await expect(page.locator('select[name="boutique"]')).toBeVisible();
});
