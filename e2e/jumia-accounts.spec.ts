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
