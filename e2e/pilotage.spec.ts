import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * PILOTAGE — le tableau de bord et ses rubriques.
 *
 * Ces tests couvrent le reproche central : « je change de boutique et les
 * chiffres ne changent pas ». Le filtre de périmètre est désormais porté par
 * l'URL (`?boutique=`), donc testable par lien direct.
 */
const PASSWORD = "MotDePasse123";

test.describe("Pilotage", () => {
  test("le tableau de bord annonce le périmètre affiché", async ({ page }) => {
    const email = `pilotage-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);

    await page.request.post("/api/shops", {
      data: {
        name: "PILOTAGE ALPHA",
        externalShopId: `E2E-PILOT-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    await gotoSafely(page, "/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    // Le bandeau de contexte dit ce que l'on regarde : ici, la boutique.
    const scope = page.getByTestId("scope-bar");
    await expect(scope).toContainText("PILOTAGE ALPHA");
    await expect(scope).toContainText("30 jours");
  });

  test("chaque rubrique du pilotage a sa propre page", async ({ page }) => {
    const email = `pilotage-rubriques-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);

    for (const [chemin, titre] of [
      ["/alertes", "Alertes"],
      ["/performances", "Performances"],
      ["/activites", "Activités"],
      ["/recherche", "Recherche dans mon espace"],
      ["/apparence", "Apparence"],
    ] as const) {
      const response = await page.goto(chemin);
      expect(response?.status(), `${chemin} doit répondre`).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { name: titre, exact: true }).first(),
        `${chemin} doit porter son propre titre`,
      ).toBeVisible();
    }
  });

  test("le menu ne renvoie plus vers des ancres de la même page", async ({ page }) => {
    const email = `pilotage-menu-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);
    // Une boutique : sans elle, l'utilisateur n'a aucune permission et les
    // rubriques conditionnelles seraient masquées (comportement attendu).
    await page.request.post("/api/shops", {
      data: {
        name: "PILOTAGE MENU",
        externalShopId: `E2E-PILOT-M-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    await gotoSafely(page, "/dashboard");
    await page.waitForLoadState("networkidle");

    const liens = await page
      .locator("aside nav a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
    // Aucune entrée de pilotage ne pointe vers une ancre du tableau de bord.
    expect(liens.filter((href) => href.startsWith("/dashboard#"))).toHaveLength(0);
    // Les rubriques du pilotage pointent vers des pages distinctes.
    expect(liens).toContain("/alertes");
    expect(liens).toContain("/performances");
    expect(liens).toContain("/activites");
  });

  test("le filtre de boutique est porté par l'URL", async ({ page }) => {
    const email = `pilotage-filtre-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);

    for (const name of ["PILOTAGE FILTRE A", "PILOTAGE FILTRE B"]) {
      await page.request.post("/api/shops", {
        data: {
          name,
          externalShopId: `E2E-PILOT-F-${name}-${Date.now()}`,
          country: "CI",
          currency: "XOF",
        },
      });
    }

    await gotoSafely(page, "/dashboard");
    await page.waitForLoadState("networkidle");

    const select = page.locator('select[aria-label="Boutique affichée"]');
    await expect(select).toBeVisible();
    const options = await select
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(options.length).toBeGreaterThan(1);

    // Choisir une boutique écrit `?boutique=` : l'état est partageable.
    await select.selectOption(options[1]);
    await expect(page).toHaveURL(/boutique=/);
    await page.waitForLoadState("networkidle");
  });

  test("une boutique hors périmètre est refusée explicitement", async ({ page }) => {
    const email = `pilotage-refus-${Date.now()}@exemple.ci`;
    await login(page, email, PASSWORD);
    await page.request.post("/api/shops", {
      data: {
        name: "PILOTAGE REFUS",
        externalShopId: `E2E-PILOT-R-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    const intruse = crypto.randomUUID();
    await gotoSafely(page, `/dashboard?boutique=${intruse}`);
    await page.waitForLoadState("networkidle");

    // Pas un tableau vide : un refus explicite (un zéro trompeur est pire).
    await expect(page.getByRole("alert").first()).toContainText("périmètre");
  });

  test("les permissions sont vérifiées côté serveur, pas seulement dans le menu", async ({
    page,
  }) => {
    const emailA = `pilotage-proprio-${Date.now()}@exemple.ci`;
    const emailB = `pilotage-vendeur-${Date.now()}@exemple.ci`;

    // 1. Le vendeur doit **exister** avant l'invitation (sinon un jeton est
    //    nécessaire). On l'inscrit dans un contexte jetable : l'inscription
    //    ouvre une session, on ne veut surtout pas qu'elle remplace celle du
    //    propriétaire dans le contexte principal.
    const contexteVendeur = await page.context().browser()!.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });
    const pageInscription = await contexteVendeur.newPage();
    await pageInscription.request.post("/api/auth/register", {
      data: { email: emailB, password: PASSWORD, fullName: "Vendeur" },
    });
    await contexteVendeur.close();

    // 2. Le propriétaire crée sa boutique.
    await login(page, emailA, PASSWORD);
    const created = await page.request.post("/api/shops", {
      data: {
        name: "PILOTAGE PERMISSIONS",
        externalShopId: `E2E-PILOT-P-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    expect(created.status()).toBe(201);
    const shopId = (await created.json()).data?.id as string;

    // 3. Le vendeur existe déjà : il est ajouté immédiatement, sans jeton.
    const invite = await page.request.post(`/api/shops/${shopId}/members`, {
      data: { email: emailB, role: "stock" },
    });
    expect(invite.status()).toBe(201);

    // 4. Le vendeur n'a pas `reports:read` : la comparaison des performances
    //    ne doit rien lui montrer, même en ouvrant l'URL directement.
    const contexte = await page.context().browser()!.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });
    const pageVendeur = await contexte.newPage();
    await pageVendeur.request.post("/api/auth/login", {
      data: { email: emailB, password: PASSWORD },
    });
    const reponse = await pageVendeur.goto("/performances");
    expect(reponse?.status()).toBeLessThan(400);
    await expect(pageVendeur.getByText(/Aucun rapport disponible/i).first()).toBeVisible();
    await contexte.close();
  });
});
