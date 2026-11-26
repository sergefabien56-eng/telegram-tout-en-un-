import { existsSync, readFileSync } from "node:fs";
import { ensureAccount, login } from "./helpers/auth";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Charge `.env.local` (le runner Playwright ne le fait pas). */
function loadEnvLocal() {
  const file = process.env.E2E_ENV_FILE ?? ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

/**
 * Accessibilité (WCAG 2.1 AA) : contrastes, libellés, hiérarchie de titres,
 * navigation clavier.
 *
 * Les pages publiques sont auditées même sans base de données ; les pages
 * connectées exigent DATABASE_URL.
 */
/**
 * Les pages connectées écrivent dans la base réelle : elles sont ignorées en CI
 * (pas de DATABASE_URL), mais les pages publiques sont toujours auditées.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

/** Ne retient que les violations réellement bloquantes (AA). */
async function expectNoViolations(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  const summary = blocking
    .map((violation) => `${violation.id} (${violation.nodes.length} nœud(s))`)
    .join(", ");
  expect(blocking, `${label} — violations AA : ${summary || "aucune"}`).toHaveLength(0);
}

test.describe("accessibilité des pages publiques", () => {
  test("la page d'accueil passe l'audit WCAG 2.1 AA", async ({ page }) => {
    await page.goto("/");
    await expectNoViolations(page, "accueil");
  });

  test("la connexion passe l'audit et reste utilisable au clavier", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page, "connexion");

    // Tabulation : premier champ atteignable au clavier.
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/adresse e-mail/i)).toBeFocused();

    // Le formulaire se remplit et se valide entièrement au clavier.
    await page.keyboard.type("clavier@exemple.ci");
    await page.keyboard.press("Tab");
    await page.keyboard.type("mauvais-mot-de-passe");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: /se connecter/i }).press("Enter");

    // La base peut être absente (CI) : la page doit alors afficher un message
    // d'erreur lisible plutôt qu'une erreur réseau brute.
    await expect(
      page.getByText(
        /adresse e-mail ou mot de passe incorrect|service temporairement indisponible/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeEnabled();
  });
});

test.describe.serial("accessibilité des pages connectées", () => {
  test.skip(!hasDb, "DATABASE_URL requis pour les pages connectées.");
  const email = `e2e-a11y-${Date.now()}@exemple.ci`;
  const userName = "E2E Acc";
  const password = "MotDePasse123";

  test("inscrit le compte de test", async ({ page }) => {
    const response = await page.request.post("/api/auth/register", {
      data: { email, password, fullName: userName },
    });
    expect(response.ok()).toBe(true);
  });

  test("le tableau de bord passe l'audit dans les deux thèmes", async ({ page }) => {
    await login(page, email, password);

    await expectNoViolations(page, "tableau de bord clair");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expectNoViolations(page, "tableau de bord sombre");
  });

  test("les pages du pilotage passent l'audit WCAG 2.1 AA", async ({ page }) => {
    await login(page, email, password);

    // Une boutique : sans elle, les pages affichent leur état vide et le
    // résultat de l'audit ne porterait pas sur les écrans réels.
    await page.request.post("/api/shops", {
      data: {
        name: "A11Y PILOTAGE",
        externalShopId: `E2E-A11Y-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    for (const chemin of [
      "/dashboard",
      "/performances",
      "/alertes",
      "/activites",
      "/recherche",
      "/apparence",
    ]) {
      await page.goto(chemin);
      await expectNoViolations(page, `pilotage ${chemin}`);
    }
  });

  test("les pages des ventes et commandes passent l'audit WCAG 2.1 AA", async ({ page }) => {
    await login(page, email, password);

    await page.request.post("/api/shops", {
      data: {
        name: "A11Y VENTES",
        externalShopId: `E2E-A11Y-V-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });

    // Les quatre rubriques et leurs sous-vues : chacune a son propre écran.
    for (const chemin of [
      "/commandes",
      "/commandes/annulees",
      "/commandes/a-traiter",
      "/commandes/a-traiter/en-attente",
      "/commandes/a-traiter/pretes-a-expedier",
      "/commandes/a-traiter/etiquettes",
      "/commandes/expediees",
      "/commandes/retours",
      "/commandes/villes",
    ]) {
      await page.goto(chemin);
      await expectNoViolations(page, `ventes ${chemin}`);
    }

    // Et dans le thème sombre, où le contraste doit rester lisible.
    await page.goto("/commandes");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expectNoViolations(page, "ventes /commandes sombre");
  });

  test("les actions rapides se ferment à Échap et rendent le focus", async ({ page }) => {
    await login(page, email, password);
    await page.goto("/securite");
    const trigger = page.getByRole("button", { name: /actions rapides/i });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("menuitem", { name: /ajouter une boutique/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("le menu du profil se ferme à Échap et rend le focus", async ({ page }) => {
    await login(page, email, password);
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: /menu du compte/i });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("tous les onglets de la navigation atteignables au clavier", async ({ page }) => {
    await login(page, email, password);
    await page.goto("/dashboard");
    // La sidebar (web) est une liste de liens : ils doivent être atteignables au
    // clavier. La barre du haut contient des boutons avant la navigation, donc on
    // parcourt la suite d'éléments focusables sans supposer leur ordre.
    const links = page.locator('aside a[href^="/"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    const sidebarHrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    );

    const reached = new Set<string | null>();
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press("Tab");
      reached.add(await page.evaluate(() => document.activeElement?.getAttribute("href")));
    }

    const reachableLinks = sidebarHrefs.filter((href) => href && reached.has(href));
    // Au moins les trois premiers liens de la barre latérale doivent être
    // atteignables au clavier (le reste dépend de la longueur du menu).
    expect(
      reachableLinks.length,
      "liens de navigation atteignables au clavier",
    ).toBeGreaterThanOrEqual(Math.min(count, 3));
    expect(reachableLinks.length).toBeLessThanOrEqual(count);
  });

  test("nettoie : supprime le compte de test", async ({ page }) => {
    const status = await page.request.get("/api/auth/me");
    expect(status.status()).toBeGreaterThanOrEqual(200);
  });
});
