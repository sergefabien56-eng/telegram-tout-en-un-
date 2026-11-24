import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Les comptes vendeur Jumia se gèrent depuis l'application : l'écran doit
 * exister, proposer le formulaire d'ajout et n'exposer aucun jeton.
 */
test("L'écran Comptes Jumia permet d'ajouter un compte sans passer par la base", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `jumia-comptes-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await gotoSafely(page, "/boutiques#comptes-jumia");

  await expect(page.getByRole("heading", { name: "Comptes Jumia connectés" })).toBeVisible();
  await expect(page.getByText("Ajouter un compte vendeur")).toBeVisible();

  // Le formulaire demande exactement les informations du Vendor Center.
  await expect(page.getByLabel("Nom du compte")).toBeVisible();
  await expect(page.getByLabel(/Identifiant client Jumia/)).toBeVisible();
  await expect(page.getByLabel("Refresh token")).toBeVisible();

  // L'API ne renvoie jamais de jeton.
  const response = await page.request.get("/api/jumia/accounts");
  const payload = (await response.json()) as {
    ok?: boolean;
    data?: { accounts: { id: string; label: string; clientId: string }[] };
  };
  expect(payload.ok).toBe(true);
  for (const account of payload.data?.accounts ?? []) {
    expect(JSON.stringify(account)).not.toMatch(/refresh/i);
  }
});

/** Le bouton « Tester » répond sur une route qui existe, et protège les comptes. */
test("Le test et le rattachement d'un compte répondent proprement", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `jumia-api-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  // Compte inexistant → 403 (propriété vérifiée côté serveur).
  const testResponse = await page.request.post(
    "/api/jumia/accounts/00000000-0000-0000-0000-000000000000/test",
  );
  expect(testResponse.status()).toBe(403);

  // Rattachement d'une boutique inconnue sur un compte inexistant → 403.
  const attachResponse = await page.request.post(
    "/api/jumia/accounts/00000000-0000-0000-0000-000000000000/shops",
    { data: { remoteShopId: "nimporte" } },
  );
  expect(attachResponse.status()).toBe(403);
});

/**
 * Ajouter une boutique ne doit pas exiger d'identifiant technique : le
 * rattachement Jumia se fait ensuite depuis l'écran Connexions Jumia.
 */
test("Une boutique se crée avec un simple nom", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `boutique-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  const created = await page.request.post("/api/shops", {
    data: { name: "Ma Nouvelle Boutique", country: "CI", currency: "XOF" },
  });
  expect(created.status()).toBe(201);
  const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
  expect(payload.ok).toBe(true);
  expect(payload.data?.id).toBeTruthy();
});

