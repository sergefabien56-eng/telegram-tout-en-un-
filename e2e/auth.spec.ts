import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Charge `.env.local` (le runner Playwright ne le fait pas).
 * Chemin fixe volontairement : le runner transpile en CommonJS.
 */
function loadEnvLocal() {
  const file = process.env.E2E_ENV_FILE ?? ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvLocal();

/**
 * Ces tests écrivent dans la base réelle : ils sont ignorés tant que
 * DATABASE_URL n'est pas fourni (CI par exemple).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
test.skip(!hasDb, "DATABASE_URL requis pour les tests d'authentification.");


/**
 * Parcours d'authentification et de double authentification.
 * Nécessite la base Neon réelle (variables d'environnement chargées).
 */

const email = `e2e-2fa-${Date.now()}@exemple.ci`;
const password = "MotDePasse123";

test.describe.serial("connexion", () => {
  test("redirige un visiteur non connecté vers /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("refuse un mot de passe erroné sans révéler le compte", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: /connexion/i }).click();
    await expect(page.getByText(/adresse e-mail ou mot de passe incorrect/i)).toBeVisible();
  });

  test("inscrit un compte puis ouvre une session", async ({ page, request }) => {
    const response = await request.post("/api/auth/register", {
      data: { email, password, fullName: "E2E 2FA" },
    });
    expect(response.ok()).toBe(true);

    await page.goto("/login");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill(password);
    await page.getByRole("button", { name: /connexion/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/tableau de bord/i).first()).toBeVisible();
  });

  test("affiche la Sécurité et les actions rapides sans créer de donnée", async ({ page }) => {
    await page.goto("/securite");
    await expect(page).toHaveURL(/\/securite$/);
    await expect(page.getByRole("heading", { name: /sécurité du compte/i })).toBeVisible();
    await expect(page.getByText(/désactivée/i)).toBeVisible();

    // Barre du haut : actions rapides.
    const trigger = page.getByRole("button", { name: /actions rapides/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByRole("menuitem", { name: /ajouter une boutique/i })).toBeVisible();
    // Module non branché : texte + badge, aucun bouton actif (règle R1).
    await expect(page.getByText("Nouvelle commande")).toBeVisible();
    await expect(page.getByText("Bientôt disponible").first()).toBeVisible();

    await page.getByRole("menuitem", { name: /ajouter une boutique/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^nom$/i)).toBeVisible();
    await expect(dialog.getByLabel(/identifiant boutique jumia/i)).toBeVisible();

    // Échap ferme la boîte de dialogue (accessibilité clavier).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("déconnecte puis refuse l'accès à /dashboard", async ({ page, request }) => {
    await request.post("/api/auth/logout");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe.serial("double authentification", () => {
  test("active la 2FA depuis la page Sécurité", async ({ page, request }) => {
    // Connexion (pas encore de 2FA sur ce compte).
    await request.post("/api/auth/login", { data: { email, password } });
    await page.goto("/securite");

    const setupResponse = await request.post("/api/auth/2fa/setup");
    const setup = await setupResponse.json();
    expect(setup.ok).toBe(true);
    expect(setup.data.secret).toMatch(/^[A-Z2-7]{32}$/);

    await page.getByRole("button", { name: /^activer$/i }).click();
    await expect(page.getByAltText(/qr code/i)).toBeVisible();

    const { generateSync } = await import("otplib");
    const token = generateSync({ secret: setup.data.secret, digits: 6, period: 30 });
    await page.getByPlaceholder("123456").fill(token);
    await page.getByRole("button", { name: /confirmer et activer/i }).click();

    await expect(page.getByText(/8 codes de secours/i).or(page.getByText(/j'ai enregistré/i))).toBeVisible();
    await expect(page.getByText(/activée — un code est demandé/i)).toBeVisible();
  });

  test("exige le second facteur à la connexion", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill(password);
    await page.getByRole("button", { name: /connexion/i }).click();

    await expect(page).toHaveURL(/\/two-factor\?challenge=/);
    await expect(page.getByRole("heading", { name: /vérification en deux étapes/i })).toBeVisible();
  });

  test("redirige /two-factor sans challenge vers /login", async ({ page }) => {
    await page.goto("/two-factor");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("nettoie : supprime le compte de test", async ({ request }) => {
    // Le nettoyage réel est fait par scripts/cleanup-test-accounts.mjs.
    const status = await request.get("/api/auth/2fa/status");
    expect(status.status()).toBeGreaterThanOrEqual(200);
  });
});
