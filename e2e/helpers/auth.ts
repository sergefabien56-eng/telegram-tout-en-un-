import { expect, type Page } from "@playwright/test";

/**
 * Helpers d'authentification pour les harnais E2E.
 *
 * Chaque test Playwright possède son PROPRE contexte : les cookies ne sont pas
 * partagés entre tests. On ouvre donc la session par l'API (le cookie est alors
 * posé dans le contexte) puis on charge une page protégée.
 */

export async function ensureAccount(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/register", {
    data: { email, password, fullName: "E2E" },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!payload?.ok) {
    throw new Error(`Inscription impossible (${response.status()}) : ${JSON.stringify(payload)}`);
  }
}

/** Ouvre une session par l'API et vérifie qu'une page protégée répond. */
export async function login(page: Page, email: string, password: string) {
  await ensureAccount(page, email, password);

  const response = await page.request.post("/api/auth/login", { data: { email, password } });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: { requiresTwoFactor?: boolean };
  } | null;

  // Un autre test a pu activer la 2FA sur ce compte : on la retire pour
  // retrouver un compte « mot de passe seul ».
  if (payload?.data?.requiresTwoFactor) {
    const disable = await page.request.post("/api/auth/2fa/disable", {
      data: { password },
    });
    if (!disable.ok()) {
      throw new Error(`Impossible de désactiver la 2FA : ${disable.status()}`);
    }
    const retry = await page.request.post("/api/auth/login", { data: { email, password } });
    if (!retry.ok()) {
      throw new Error(`Connexion refusée après reset 2FA : ${retry.status()}`);
    }
  } else if (!response.ok()) {
    throw new Error(`Connexion refusée (${response.status()}) : ${JSON.stringify(payload)}`);
  }

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
}

/**
 * Navigation robuste : le serveur de dev peut encore compiler la page, ce qui
 * détache la frame en cours de `goto`. On réessaie une fois.
 */
export async function gotoSafely(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }
}
