import { expect, test } from "@playwright/test";

test("la page d'accueil répond et affiche le titre", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TOUT EN UN/);
  await expect(page.getByText("TOUT EN UN Business Manager")).toBeVisible();
});

test("l'état de santé répond", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body).toHaveProperty("config");
});
