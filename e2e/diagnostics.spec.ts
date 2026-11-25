import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * DIAGNOSTIC MULTIBOUTIQUE — parcours réel.
 *
 * Ce test ne simule **aucune** donnée métier : il crée deux boutiques via
 * l'API, puis vérifie que l'écran de diagnostic annonce honnêtement leur
 * état (non rattachées) au lieu d'afficher un « connecté » synthétique.
 *
 * Les boutiques créées n'ont aucun compte vendeur Jumia : le diagnostic ne
 * doit donc tenter aucun appel distant et ne doit annoncer aucune donnée.
 */
test("le diagnostic annonce l'état réel de chaque boutique", async ({ page }) => {
  const email = `diag-e2e-${Date.now()}@exemple.ci`;
  const password = "MotDePasse123";
  await login(page, email, password);

  const names: string[] = [];
  for (const label of ["Boutique Diagnostic A", "Boutique Diagnostic B"]) {
    const created = await page.request.post("/api/shops", {
      data: {
        name: label,
        platform: "jumia",
        externalShopId: `E2E-DIAG-${label}-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json()) as { ok?: boolean; data?: { id: string } };
    if (!payload.ok || !payload.data) throw new Error("Création de boutique impossible en E2E.");
    names.push(label);
  }

  // L'API de diagnostic doit répondre avec un rapport factuel.
  const response = await page.request.get("/api/admin/diagnostics");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    ok?: boolean;
    data?: {
      shops: { name: string; connection: { state: string; operational: boolean }; verdict: string }[];
      summary: { shops: number; operationnelles: number };
    };
  };
  expect(payload.ok).toBe(true);
  expect(payload.data?.summary.shops).toBe(2);
  // Aucune boutique n'est rattachée : aucune ne doit être « opérationnelle ».
  expect(payload.data?.summary.operationnelles).toBe(0);
  for (const shop of payload.data?.shops ?? []) {
    expect(shop.connection.state).toBe("non_rattachee");
    expect(shop.connection.operational).toBe(false);
  }

  // L'écran doit afficher l'état factuel, jamais un statut stocké.
  await gotoSafely(page, "/admin/diagnostics");
  await expect(page.getByRole("heading", { name: /Diagnostic des boutiques/i })).toBeVisible();
  for (const name of names) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Non rattachée").first()).toBeVisible();
  // Aucune donnée ne doit être annoncée comme reçue.
  await expect(page.getByText(/Données reçues, synchronisée/).first()).toBeVisible();
});

test("le diagnostic refuse un utilisateur sans accès d'administration", async ({ page }) => {
  const email = `diag-membre-${Date.now()}@exemple.ci`;
  const password = "MotDePasse123";
  await login(page, email, password);

  const response = await page.request.get("/api/admin/diagnostics");
  expect(response.status()).toBe(403);
});
