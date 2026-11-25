import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";
import { insererCommandes } from "./helpers/orders-fixtures";

/**
 * REFONTE « VENTES & COMMANDES » — contrôles d'interface.
 *
 * Ce fichier vérifie ce que l'**utilisateur** voit :
 * - les compteurs et le total affiché, sans valeur codée en dur ;
 * - les contrôles (période, boutique, Du, Au, statut) ;
 * - la liste repliable et l'ouverture du détail d'une commande ;
 * - les refus de la synchronisation (période incomplète, inversée, trop large) ;
 * - le contrôle des permissions côté serveur.
 */
const PASSWORD = "MotDePasse123";

/** Compte propriétaire avec une boutique (données réelles : base de prod). */
async function proprietaireAvecBoutique(page: import("@playwright/test").Page) {
  const email = `ventes-refonte-${Date.now()}@exemple.ci`;
  await login(page, email, PASSWORD);
  const created = await page.request.post("/api/shops", {
    data: {
      name: "VENTES REFONTE",
      platform: "jumia",
      externalShopId: `E2E-VR-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });
  expect(created.status()).toBe(201);
  return email;
}

test.describe("Refonte Ventes & Commandes", () => {
  test("la rubrique A affiche période, boutique, Du, Au et Statut", async ({ page }) => {
    test.setTimeout(180_000);
    await proprietaireAvecBoutique(page);

    await gotoSafely(page, "/commandes");
    await page.waitForLoadState("domcontentloaded");

    // Les cinq contrôles demandés sont présents.
    await expect(page.getByRole("heading", { name: "Période affichée" })).toBeVisible();
    await expect(page.locator('input[name="du"]')).toBeVisible();
    await expect(page.locator('input[name="au"]')).toBeVisible();
    await expect(page.locator('select[name="boutique"]')).toBeVisible();
    await expect(page.locator('select[name="statut"]')).toBeVisible();

    // Les compteurs sont annoncés avec leur définition.
    await expect(page.getByText("Commandes", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Total affiché", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(/Ce n’est est pas le CA encaissé|pas le CA encaissé/),
    ).toBeVisible();

    // La source des données et la dernière synchronisation sont indiquées.
    await expect(page.getByText(/Source : API Jumia/)).toBeVisible();
    await expect(page.getByText(/Dernière synchronisation réussie/)).toBeVisible();
  });

  test("la rubrique A propose Historique, Annulées et l'export", async ({ page }) => {
    test.setTimeout(180_000);
    await proprietaireAvecBoutique(page);

    await gotoSafely(page, "/commandes");
    await page.waitForLoadState("domcontentloaded");

    const sousRubriques = page.getByRole("navigation", { name: /Sous-rubriques/ });
    await expect(sousRubriques.getByRole("link", { name: "Historique" })).toBeVisible();
    await expect(sousRubriques.getByRole("link", { name: "Annulées" })).toBeVisible();
    // L'export est une action de la rubrique, pas une entrée de menu.
    await expect(page.getByRole("link", { name: /Historique des exports/ })).toBeVisible();
  });

  test("la liste est repliable et chaque commande ouvre son détail", async ({ page }) => {
    test.setTimeout(180_000);
    await proprietaireAvecBoutique(page);
    const shops = (await (await page.request.get("/api/shops")).json()) as {
      data?: { id: string }[];
    };
    const shopId = shops.data?.[0]?.id;
    if (!shopId) throw new Error("Boutique introuvable.");

    // Une commande préparée et une commande livrée : la liste a du contenu.
    await insererCommandes(shopId, [
      {
        externalOrderId: `E2E-CMD-1-${Date.now()}`,
        orderNumber: "E2E-CMD-1",
        status: "PENDING",
        totalAmountMinor: 12500,
        totalItems: 2,
        packedItems: 0,
        customerCity: "Abidjan",
        remoteCreatedAt: new Date().toISOString(),
      },
      {
        externalOrderId: `E2E-CMD-2-${Date.now()}`,
        orderNumber: "E2E-CMD-2",
        status: "DELIVERED",
        totalAmountMinor: 37500,
        totalItems: 1,
        packedItems: 1,
        customerCity: "Bouaké",
        remoteCreatedAt: new Date().toISOString(),
      },
    ]);

    await gotoSafely(page, "/commandes");
    await page.waitForLoadState("domcontentloaded");

    // Les compteurs suivent la base : ils ne sont jamais codés en dur.
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

    // La liste est repliée par défaut, mais accessible.
    const bascule = page.getByRole("button", { name: /Afficher la liste/ });
    await expect(bascule).toBeVisible();
    await bascule.click();
    await expect(page.getByRole("button", { name: /Masquer la liste/ })).toBeVisible();

    // Chaque commande ouvre son propre détail.
    await page.getByRole("link", { name: "E2E-CMD-1" }).click();
    await expect(page.getByRole("heading", { name: /Commande E2E-CMD-1/ })).toBeVisible();
    await expect(page.getByText("Abidjan")).toBeVisible();
  });

  test("la rubrique D agrège les localités sans exposer de données personnelles", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await proprietaireAvecBoutique(page);

    await gotoSafely(page, "/commandes/villes");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Villes & localités" })).toBeVisible();
    // La source et la fraîcheur des données sont toujours annoncées.
    await expect(page.getByText(/Source : API Jumia/)).toBeVisible();
    await expect(
      page.getByText(/jamais synchronisée| Dernière synchronisation réussie/),
    ).toBeVisible();
    // Aucune colonne de nom, téléphone ou adresse.
    await expect(page.getByText("Client", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Téléphone", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Adresse", { exact: true })).toHaveCount(0);
    // Soit il y a des localités (et la définition du taux est donnée), soit
    // l'état vide est annoncé honnêtement : jamais de « 0 » fabriqué.
    const definition = page.getByText(/Le taux d’échec = commandes en échec/);
    const etatVide = page.getByText(/Aucune localité connue pour l’instant/);
    await expect(definition.or(etatVide).first()).toBeVisible();
  });

  test("la synchronisation refuse une période inversée ou trop large", async ({ page }) => {
    test.setTimeout(180_000);
    await proprietaireAvecBoutique(page);

    await gotoSafely(page, "/commandes");
    await page.waitForLoadState("domcontentloaded");

    const panneau = page.locator("section").filter({ hasText: "Synchroniser cette période" });
    const du = panneau.getByLabel("Du", { exact: true });
    const au = panneau.getByLabel("Au", { exact: true });

    // Période inversée : la date « Du » est postérieure à « Au ». Le refus
    // est annoncé sans attendre le lancement.
    await du.fill("2026-11-20");
    await au.fill("2026-11-01");
    await expect(panneau.getByText(/Période inversée/)).toBeVisible();

    // Période trop large : au-delà de la limite de l'API Jumia (90 jours).
    await du.fill("2026-01-01");
    await au.fill("2026-11-01");
    await expect(panneau.getByText(/Période trop large/)).toBeVisible();

    // Une période valide ne déclenche plus d'alerte.
    await du.fill("2026-11-01");
    await au.fill("2026-11-20");
    await expect(panneau.getByText(/Période inversée|Période trop large/)).toHaveCount(0);
  });

  test("l'API de synchronisation refuse une période incomplète ou inversée", async ({ page }) => {
    const email = `ventes-api-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);
    const created = await page.request.post("/api/shops", {
      data: {
        name: "VENTES API",
        platform: "jumia",
        externalShopId: `E2E-VAPI-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);
    const shops = (await (await page.request.get("/api/shops")).json()) as {
      data?: { id: string }[];
    };
    const shopId = shops.data?.[0]?.id;
    if (!shopId) throw new Error("Boutique introuvable.");

    const incomplete = await page.request.post(`/api/shops/${shopId}/commandes/sync`, {
      data: { from: "2026-11-01" },
    });
    expect(incomplete.status()).toBe(400);
    expect((await incomplete.text()).toLowerCase()).toContain("période incomplète");

    const inversee = await page.request.post(`/api/shops/${shopId}/commandes/sync`, {
      data: { from: "2026-11-20", to: "2026-11-01" },
    });
    expect(inversee.status()).toBe(400);
    expect((await inversee.text()).toLowerCase()).toContain("inversée");

    const tropLarge = await page.request.post(`/api/shops/${shopId}/commandes/sync`, {
      data: { from: "2026-01-01", to: "2026-11-01" },
    });
    expect(tropLarge.status()).toBe(400);
    expect((await tropLarge.text()).toLowerCase()).toContain("trop large");
  });

  test("les permissions sont contrôlées côté serveur", async ({ page }) => {
    test.setTimeout(180_000);
    // Un membre « stock » n'a pas `orders:write` : la synchronisation doit
    // être refusée par l'API, même si l'interface cachait déjà le bouton.
    const proprietaire = `ventes-perm-prop-${Date.now()}@exemple.ci`;
    await login(page, proprietaire, PASSWORD);
    const created = await page.request.post("/api/shops", {
      data: {
        name: "VENTES PERM",
        platform: "jumia",
        externalShopId: `E2E-VPERM-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);

    const shops = (await (await page.request.get("/api/shops")).json()) as {
      data?: { id: string }[];
    };
    const shopId = shops.data?.[0]?.id;
    if (!shopId) throw new Error("Boutique introuvable.");

    // Un contexte isolé : l'inscription ne doit pas prendre la place du
    // propriétaire (c'est ce qui a cassé la preuve précédente).
    const contexte = await page.context().browser()!.newContext();
    const membre = await contexte.newPage();
    const email = `ventes-perm-membre-${Date.now()}@exemple.ci`;
    await login(membre, email, PASSWORD);

    // C'est le propriétaire qui invite : le membre n'a pas `members:write`.
    const invitation = await page.request.post(`/api/shops/${shopId}/members`, {
      data: { email, role: "stock" },
    });
    expect([200, 201]).toContain(invitation.status());

    const refus = await membre.request.post(`/api/shops/${shopId}/commandes/sync`, {
      data: { from: "2026-11-01", to: "2026-11-02" },
    });
    expect(refus.status()).toBe(403);
    await contexte.close();
  });
});
