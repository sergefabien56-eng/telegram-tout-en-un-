import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Le thème doit survivre à un **rechargement complet** de la page.
 *
 * Le bouton « Filtrer » soumet un formulaire GET natif : la page est
 * rechargée, pas remplacée. Le thème étant relu au chargement, une règle
 * mal écrite suffisait à rebasculer l'interface en clair — ce qui est
 * visible en mode sombre.
 *
 * Le test force un système en mode sombre (le cas d'un téléphone en thème
 * sombre) et vérifie les trois choix possibles.
 */
test.use({ colorScheme: "dark" });

test.describe("apparence — le thème survit au rechargement", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, `theme-${Date.now()}@exemple.ci`, "MotDePasse123");
  });

  const etat = async (page: import("@playwright/test").Page) =>
    page.evaluate(() => ({
      sombre: document.documentElement.classList.contains("dark"),
      choix: localStorage.getItem("teu-theme"),
    }));

  test("le choix « Système » suit la préférence du système", async ({ page }) => {
    await page.goto("/apparence");
    await page.evaluate(() => localStorage.setItem("teu-theme", "system"));
    await page.reload();

    const etatApresChargement = await etat(page);
    expect(etatApresChargement.choix).toBe("system");
    // Le système est en mode sombre : l'interface doit l'être aussi.
    expect(etatApresChargement.sombre).toBe(true);

    // Un rechargement complet ne doit rien changer.
    await page.reload();
    const etatApresRechargement = await etat(page);
    expect(etatApresRechargement.sombre).toBe(true);
  });

  test("un choix explicite est conservé", async ({ page }) => {
    await page.goto("/apparence");

    await page.evaluate(() => localStorage.setItem("teu-theme", "dark"));
    await page.reload();
    expect((await etat(page)).sombre).toBe(true);

    await page.evaluate(() => localStorage.setItem("teu-theme", "light"));
    await page.reload();
    expect((await etat(page)).sombre).toBe(false);
  });

  test("le filtre ne rebascule pas le thème", async ({ page }) => {
    // La page des commandes n'affiche ses filtres que si le compte a une
    // boutique : on en crée une.
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE THÈME E2E",
        platform: "jumia",
        externalShopId: `THEME-E2E-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as { data?: { id?: string } } | null;
    expect(payload?.data?.id).toBeTruthy();

    await page.goto("/commandes");
    await page.evaluate(() => localStorage.setItem("teu-theme", "system"));
    await page.reload();
    expect((await etat(page)).sombre).toBe(true);

    // Le formulaire de filtre est un GET natif : la page est rechargée.
    await page.getByRole("button", { name: "Filtrer" }).click();
    await page.waitForLoadState("domcontentloaded");

    const etatApresFiltre = await etat(page);
    expect(etatApresFiltre.sombre).toBe(true);
  });
});
