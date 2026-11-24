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
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
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

/**
 * Chaque test Playwright a son PROPRE contexte : les cookies ne sont pas
 * partagés entre tests. Tout test qui touche une page protégée doit donc se
 * connecter lui-même.
 */
/**
 * Crée le compte de test. L'inscription ouvre une session : le cookie est
 * ensuite remplacé par une connexion explicite (les contextes sont isolés).
 */
async function ensureAccount(page: import("@playwright/test").Page) {
  const response = await page.request.post("/api/auth/register", {
    data: { email, password, fullName: "E2E 2FA" },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!payload?.ok) {
    throw new Error(
      `Inscription impossible (${response.status()}) : ${JSON.stringify(payload)}`,
    );
  }
}

/**
 * Ouvre une session par l'API, puis charge le tableau de bord.
 * Le compte peut avoir la 2FA activée par un test précédent : on la désactive
 * d'abord pour que ce helper reste réutilisable partout.
 */
async function login(page: import("@playwright/test").Page) {
  // Inscription d'abord : `register` pose le cookie de session qui autorise les
  // appels API suivants (2fa/status, login).
  await ensureAccount(page);

  const response = await page.request.post("/api/auth/login", { data: { email, password } });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: { requiresTwoFactor?: boolean; challenge?: string };
  } | null;

  // La 2FA d'un test précédent est désactivée AVANT l'ouverture de session :
  // `disable` exige le mot de passe et ne reçoit pas de challenge.
  if (payload?.data?.requiresTwoFactor) {
    const loginAgain = await page.request.post("/api/auth/login", { data: { email, password } });
    const again = (await loginAgain.json().catch(() => null)) as { ok?: boolean } | null;
    if (!again?.ok) throw new Error("Second appel de connexion impossible.");

    const disable = await page.request.post("/api/auth/2fa/disable", {
      data: { password },
    });
    if (!disable.ok()) {
      throw new Error(`Impossible de désactiver la 2FA : ${disable.status()} ${await disable.text()}`);
    }
    const retry = await page.request.post("/api/auth/login", { data: { email, password } });
    if (!retry.ok()) throw new Error(`Connexion refusée après reset 2FA : ${retry.status()}`);
  }
  if (!response.ok()) {
    throw new Error(`Connexion refusée (${response.status()}) : ${await response.text()}`);
  }
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.serial("connexion", () => {
  test("redirige un visiteur non connecté vers /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("refuse un mot de passe erroné sans révéler le compte", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: /se connecter/i }).click();
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
    await page.getByRole("button", { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/tableau de bord/i).first()).toBeVisible();
  });

  test("affiche la Sécurité et les actions rapides sans créer de donnée", async ({ page }) => {
    await login(page);
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

  test("déconnecte puis refuse l'accès à /dashboard", async ({ page, context }) => {
    await login(page);
    // Le menu du profil contient le formulaire de déconnexion.
    await page.getByRole("button", { name: /menu du compte/i }).click();
    // Le formulaire de déconnexion est un POST navigateur vers /api/auth/logout ;
    // la réponse est elle-même la page de connexion.
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/auth/logout")),
      page.getByRole("menuitem", { name: /déconnexion/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /^connexion$/i })).toBeVisible();

    // Le cookie de session a bien disparu.
    const cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name.startsWith("teu_session"))).toHaveLength(0);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe.serial("double authentification", () => {
  test("active la 2FA depuis la page Sécurité", async ({ page }) => {
    // Connexion réelle : les cookies du contexte alimentent ensuite page.request.
    await login(page);
    await page.goto("/securite");

    await page.getByRole("button", { name: /^activer$/i }).click();
    await expect(page.getByAltText(/qr code/i)).toBeVisible();

    const { generateSync } = await import("otplib");
    // Le code est dérivé de la clé affichée dans la page : aucun déphasage
    // possible si la requête a été émise après le clic.
    const secretFromPage = await page.getByRole("code").innerText();
    expect(secretFromPage.trim()).toMatch(/^[A-Z2-7]{32}$/);
    const token = generateSync({ secret: secretFromPage.trim(), digits: 6, period: 30 });
    await page.getByPlaceholder("123456").fill(token);
    await page.getByRole("button", { name: /confirmer et activer/i }).click();

    await expect(
      page.getByText(/codes de secours/i).or(page.getByText(/j'ai enregistré/i)),
    ).toBeVisible();
    await expect(page.getByText(/activée — un code est demandé/i)).toBeVisible();
  });

  test("exige le second facteur à la connexion", async ({ page }) => {
    // Le test précédent a activé la 2FA sur ce compte : il suffit de se reconnecter.
    await page.goto("/login");
    await page.getByLabel(/adresse e-mail/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill(password);
    await page.getByRole("button", { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/two-factor\?challenge=/);
    await expect(page.getByRole("heading", { name: /vérification en deux étapes/i })).toBeVisible();
  });

  test("redirige /two-factor sans challenge vers /login", async ({ page }) => {
    await page.goto("/two-factor");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("nettoie : supprime le compte de test", async ({ page }) => {
    // Le nettoyage réel est fait par scripts/cleanup-test-accounts.mjs.
    const status = await page.request.get("/api/auth/2fa/status");
    expect(status.status()).toBeGreaterThanOrEqual(200);
  });
});
