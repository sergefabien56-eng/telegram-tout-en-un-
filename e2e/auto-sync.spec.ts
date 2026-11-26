import { expect, test } from "@playwright/test";
import { gotoSafely, login } from "./helpers/auth";

/**
 * Rafraîchissement automatique des données Jumia.
 *
 * L'API Vendor Center de Jumia n'expose aucun webhook : la seule façon de
 * voir une nouvelle commande est de **relire** l'API. Ce test prouve que le
 * navigateur le fait tout seul et que la page se met à jour **sans** que le
 * vendeur recharge quoi que ce soit.
 */
test("les données Jumia se rafraîchissent sans action du vendeur", async ({ page }) => {
  test.setTimeout(120_000);

  const email = `autosync-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "BOUTIQUE AUTO-SYNC",
      platform: "jumia",
      externalShopId: `E2E-AUTOSYNC-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  // L'état de fraîcheur est simulé : la première observation sert de
  // référence, la suivante annonce une relecture plus récente — c'est
  // exactement ce que le composant doit détecter.
  let observations = 0;
  await page.route("**/api/shops/*/auto-sync", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { started: false, state: null } }),
      });
      return;
    }
    observations += 1;
    const lastSyncAt =
      observations === 1 ? "2026-11-26T10:00:00.000Z" : "2026-11-26T10:05:00.000Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          shopId: "simule",
          lastSyncAt,
          syncInProgress: false,
          stale: false,
        },
      }),
    });
  });

  // Le composant expose le nombre de rafraîchissements qu'il a déclenchés :
  // c'est la preuve directe que la page s'est mise à jour **seule**.
  const compteur = page.locator("[data-auto-sync-refreshes]");

  await gotoSafely(page, "/commandes/a-traiter");

  // Le composant vérifie toutes les 15 s : la première observation sert de
  // référence, la suivante annonce une relecture plus récente — c'est
  // exactement ce que le composant doit détecter, sans action du vendeur.
  await expect
    .poll(async () => Number(await compteur.getAttribute("data-auto-sync-refreshes")), {
      timeout: 45_000,
    })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {
      throw new Error(
        `rafraîchissement non détecté : observations=${observations}`,
      );
    });

  expect(observations).toBeGreaterThanOrEqual(2);
});

test("le rafraîchissement automatique est réservé à la lecture des commandes", async ({ page }) => {
  test.setTimeout(120_000);

  const email = `autosync-perm-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "BOUTIQUE PERMES",
      platform: "jumia",
      externalShopId: `E2E-PERM-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  const shops = (await (await page.request.get("/api/shops")).json()) as {
    data?: { id: string }[];
  };
  const shopId = shops.data?.[0]?.id;
  expect(shopId).toBeTruthy();

  // L'état est public pour un membre autorisé : la lecture est autorisée.
  const lecture = await page.request.get(`/api/shops/${shopId}/auto-sync`);
  expect(lecture.status()).toBe(200);
  const corps = (await lecture.json()) as {
    data?: { stale: boolean; syncInProgress: boolean };
  };
  // Une boutique non rattachée à Jumia n'est jamais périmée.
  expect(corps.data?.stale).toBe(false);

  // Le déclenchement répond 200 et ne fait rien : aucune boutique n'est
  // rattachée dans ce test.
  const declenchement = await page.request.post(`/api/shops/${shopId}/auto-sync`);
  expect(declenchement.status()).toBe(200);
  const corpsDeclenchement = (await declenchement.json()) as {
    data?: { started: boolean };
  };
  expect(corpsDeclenchement.data?.started).toBe(false);
});

test("une boutique inaccessible n'est jamais rafraîchie", async ({ page }) => {
  test.setTimeout(120_000);

  const email = `autosync-iso-e2e-${Date.now()}@exemple.ci`;
  await login(page, email, "MotDePasse123");

  await page.request.post("/api/shops", {
    data: {
      name: "BOUTIQUE ISO",
      platform: "jumia",
      externalShopId: `E2E-ISO-${Date.now()}`,
      country: "CI",
      currency: "XOF",
    },
  });

  // Une boutique qui n'appartient pas à l'utilisateur : 404, jamais 403.
  const reponse = await page.request.get(
    "/api/shops/00000000-0000-0000-0000-000000000000/auto-sync",
  );
  expect(reponse.status()).toBe(404);

  const declenchement = await page.request.post(
    "/api/shops/00000000-0000-0000-0000-000000000000/auto-sync",
  );
  expect(declenchement.status()).toBe(404);
});
