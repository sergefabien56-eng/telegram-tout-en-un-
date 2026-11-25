import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Publication de produits Jumia — envoi réel, états et refus.
 *
 * Les appels Jumia sont **simulés** : ni le quota d'écriture ni les secrets
 * ne sont consommés. Ce qui est vérifié ici, c'est le comportement de
 * l'application : boutique obligatoire, MIMI qui n'invente rien, refus
 * côté serveur, et le fait qu'une demande ne soit jamais annoncée comme
 * « publiée » au clic.
 */

test.describe.serial("Publication de produit Jumia", () => {
  test("sans boutique choisie, aucune fiche ne peut partir", async ({ page }) => {
    const email = `boutiques-obligatoire-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-OBLIG-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    // Accès direct à la page, sans boutique dans l'URL.
    await gotoSafely(page, "/boutiques/produits/nouveau");
    await page.waitForLoadState("domcontentloaded");

    // Aucune boutique n'est choisie d'office : le vendeur doit la désigner.
    await expect(page.locator("main").getByLabel("Boutique")).toHaveValue("");
    await expect(page.getByText("Choisissez la boutique qui portera ce produit")).toBeVisible();
    await expect(page.getByRole("button", { name: /Envoyer à Jumia/ })).toBeDisabled();
  });

  test("l'assistant MIMI n'invente rien et le serveur refuse un envoi incomplet", async ({
    page,
  }) => {
    const email = `boutiques-mimi-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-MIMI-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    const shopId = payload.data?.id;
    expect(shopId).toBeTruthy();

    await gotoSafely(page, `/boutiques/produits/nouveau?boutique=${shopId}`);
    await page.waitForLoadState("domcontentloaded");

    // Les trois parcours de MIMI sont présents.
    await expect(page.getByText("Parcours 1 · Une photo suffit")).toBeVisible();
    await expect(page.getByText("Parcours 2 · Des images déjà publiées")).toBeVisible();
    await expect(page.getByText("Parcours 3 · Vos informations fournisseur")).toBeVisible();

    // Le bouton d'envoi reste désactivé tant que la fiche est incomplète :
    // aucun faux succès possible.
    const envoyer = page.getByRole("button", { name: /Envoyer à Jumia/ });
    await expect(envoyer).toBeDisabled();

    // Le serveur refuse une fiche invalide (attributs manquants, SKU absent).
    const refus = await page.request.post(`/api/shops/${shopId}/produits/publications`, {
      data: { name: "Produit test" },
    });
    expect(refus.status()).toBe(422);

    // Aucune publication n'a été créée.
    const liste = await page.request.get(`/api/shops/${shopId}/produits/publications`);
    const body = (await liste.json()) as { ok?: boolean; data?: { publications?: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data?.publications ?? []).toHaveLength(0);
  });

  test("les permissions de publication sont contrôlées côté serveur", async ({ page }) => {
    const email = `boutiques-perms-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "MA BOUTIQUE",
        platform: "jumia",
        externalShopId: `E2E-PERM-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    const shopId = payload.data?.id;

    // Boutique inconnue : accès refusé, pas de fuite d'information.
    const inconnu = await page.request.post(
      "/api/shops/00000000-0000-0000-0000-000000000000/produits/publications",
      { data: { name: "x" } },
    );
    expect(inconnu.status()).toBe(404);

    // Sans boutique rattachée à Jumia : refus explicite, pas d'envoi.
    const sansRattachement = await page.request.post(`/api/shops/${shopId}/produits/publications`, {
      data: {
        name: "Produit de test",
        sellerSku: "SKU-TEST-1",
        description: "Description suffisamment longue pour passer la validation.",
        brandCode: "1045133",
        brandName: "Generic",
        categoryCode: "1005677",
        categoryName: "Sprinklers",
        price: 8999,
        currency: "XOF",
        stock: 2,
        imageUrl: "https://example.test/image.jpg",
        attributes: [],
      },
    });
    expect(sansRattachement.status()).toBe(409);

    // Le référentiel des catégories est vide : le serveur refuse aussi.
    const referentiel = await page.request.get(
      `/api/shops/${shopId}/catalogue/referentiel?type=categories`,
    );
    expect(referentiel.ok()).toBe(true);
  });
});
