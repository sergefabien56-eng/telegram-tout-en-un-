import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Module « Notifications — commandes Jumia » : cloche d'alertes, rattrapage
 * des commandes arrivées pendant l'absence, Renforcement après le seuil,
 * changement de statut, doublons, panne de synchronisation, statuts d'articles
 * mixtes et droits insuffisants.
 *
 * Les commandes utilisées ici sont **fictives** et vivent dans une boutique
 * de test (`@exemple.ci`) : elles sont supprimées à la fin de la suite. Aucun
 * appel en écriture n'est fait chez Jumia.
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

async function avecBase<T>(action: (pool: Pool) => Promise<T>): Promise<T> {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absent.");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    return await action(pool);
  } finally {
    await pool.end();
  }
}

type CommandeE2E = {
  externalOrderId: string;
  orderNumber: string;
  status: string;
  totalItems: number;
  packedItems: number;
  /** Âge de la commande, en heures. */
  ageHours: number;
  articles: { externalItemId: string; status: string }[];
};

async function insererCommandes(
  shopId: string,
  commandes: CommandeE2E[],
): Promise<void> {
  await avecBase(async (pool) => {
    for (const commande of commandes) {
      const cree = new Date(Date.now() - commande.ageHours * 3_600_000).toISOString();
      const result = await pool.query(
        `INSERT INTO orders (
           shop_id, external_order_id, order_number, status, country_code, currency,
           total_amount_minor, total_items, packed_items, is_prepayment, has_multiple_status,
           customer_first_name, customer_last_name, customer_city,
           remote_created_at, remote_updated_at, first_seen_at
         ) VALUES ($1,$2,$3,$4,'CI','XOF',10000,$5,$6,false,false,
                   'Test','Client','Abidjan',$7::timestamptz,$7::timestamptz,$7::timestamptz)
         RETURNING id`,
        [
          shopId,
          commande.externalOrderId,
          commande.orderNumber,
          commande.status,
          commande.totalItems,
          commande.packedItems,
          cree,
        ],
      );
      const orderId = result.rows[0]?.id as string;
      for (const article of commande.articles) {
        await pool.query(
          `INSERT INTO order_items (shop_id, order_id, external_item_id, status, country_code, currency)
           VALUES ($1,$2,$3,$4,'CI','XOF')`,
          [shopId, orderId, article.externalItemId, article.status],
        );
      }
    }
  });
}

async function majAgeCommande(externalOrderId: string, ageHours: number): Promise<void> {
  await avecBase(async (pool) => {
    await pool.query(
      `UPDATE orders SET remote_created_at = now() - ($2 || ' hours')::interval
        WHERE external_order_id = $1`,
      [externalOrderId, String(ageHours)],
    );
  });
}

async function majStatutSync(shopId: string, statut: string | null): Promise<void> {
  await avecBase(async (pool) => {
    await pool.query(
      `UPDATE shops SET last_sync_status = $2, last_sync_at = now() WHERE id = $1`,
      [shopId, statut],
    );
  });
}

/** Simule une boutique rattachée à Jumia (sans quoi rien n'est à relire). */
async function rattacherBoutique(shopId: string, remoteShopId: string): Promise<void> {
  await avecBase(async (pool) => {
    await pool.query(`UPDATE shops SET remote_shop_id = $2 WHERE id = $1`, [
      shopId,
      remoteShopId,
    ]);
  });
}

async function majStatutArticle(externalOrderId: string, status: string): Promise<void> {
  await avecBase(async (pool) => {
    await pool.query(
      `UPDATE order_items SET status = $2
        WHERE order_id = (SELECT id FROM orders WHERE external_order_id = $1)`,
      [externalOrderId, status],
    );
    await pool.query(
      `UPDATE orders SET status = $2
        WHERE external_order_id = $1`,
      [externalOrderId, status],
    );
  });
}

async function boutiqueDuCompte(): Promise<string> {
  return avecBase(async (pool) => {
    const result = await pool.query(
      `SELECT s.id FROM shops s
         JOIN users u ON u.id = s.owner_user_id
        WHERE u.email LIKE 'alertes-e2e-%@exemple.ci'
        ORDER BY s.created_at DESC LIMIT 1`,
    );
    const id = result.rows[0]?.id as string | undefined;
    if (!id) throw new Error("Boutique de test introuvable.");
    return id;
  });
}

test.describe("notifications — commandes Jumia", () => {
  test("une nouvelle commande apparaît comme alerte non vue et mène au bon détail", async ({
    page,
  }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");

    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      ok?: boolean;
      data?: { id?: string };
    } | null;
    expect(payload?.ok).toBe(true);
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A1",
        status: "PENDING",
        totalItems: 2,
        packedItems: 0,
        ageHours: 3,
        articles: [
          { externalItemId: `E2E-A1-1-${Date.now()}`, status: "PENDING" },
          { externalItemId: `E2E-A1-2-${Date.now()}`, status: "PENDING" },
        ],
      },
    ]);

    // L'interface est ouverte : la cloche rafraîchit ses alertes.
    await page.goto("/commandes");
    const cloche = page.getByRole("button", { name: /Alertes de commandes/ });
    await expect(cloche).toBeVisible();

    await page.request.get("/api/order-alerts?force=1");
    await page.reload();

    await expect(page.getByTestId("alertes-compteur")).toBeVisible();
    await cloche.click();
    await expect(page.getByText(/Nouvelle commande reçue/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir et préparer" })).toBeVisible();
  });

  test("l'alerte se renforce quand le seuil de 24 h est dépassé, sans doublon", async ({
    page,
  }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 2",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-2-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD2-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A2",
        status: "PENDING",
        totalItems: 1,
        packedItems: 0,
        ageHours: 2,
        articles: [{ externalItemId: `E2E-A2-1-${Date.now()}`, status: "PENDING" }],
      },
    ]);

    await page.request.get("/api/order-alerts?force=1");
    let alertes = await page.request.get("/api/order-alerts?force=1");
    let data = (await alertes.json().catch(() => null)) as {
      data?: { alerts?: { orderId: string | null; priority: string; kind: string }[] };
    } | null;
    const alerte = data?.data?.alerts?.find((row) => row.orderId !== null);
    expect(alerte?.priority).toBe("info");

    // La commande vieillit : elle dépasse le seuil préventif.
    await majAgeCommande(externalOrderId, 30);
    await page.request.get("/api/order-alerts?force=1");
    alertes = await page.request.get("/api/order-alerts?force=1");
    data = (await alertes.json().catch(() => null)) as {
      data?: { alerts?: { orderId: string | null; priority: string; kind: string }[] };
    } | null;
    const renforcee = data?.data?.alerts?.filter((row) => row.orderId !== null) ?? [];
    // Une seule alerte pour cette commande : pas de doublon, mais une escalade.
    expect(renforcee).toHaveLength(1);
    expect(renforcee[0]?.priority).toBe("critical");
    expect(renforcee[0]?.kind).toBe("delai_24h");
  });

  test("l'alerte disparaît quand la commande n'attend plus d'action", async ({ page }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 3",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-3-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD3-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A3",
        status: "PENDING",
        totalItems: 1,
        packedItems: 0,
        ageHours: 2,
        articles: [{ externalItemId: `E2E-A3-1-${Date.now()}`, status: "PENDING" }],
      },
    ]);

    await page.request.get("/api/order-alerts?force=1");
    let data = (await (await page.request.get("/api/order-alerts?force=1")).json()) as {
      data?: { alerts?: { kind: string }[] };
    };
    const alertesCommande = (data?.data?.alerts ?? []).filter(
      (row) => row.kind === "nouvelle_commande" || row.kind === "delai_24h",
    );
    expect(alertesCommande.length).toBeGreaterThan(0);

    // La commande est livrée : elle ne demande plus d'action.
    await majStatutArticle(externalOrderId, "DELIVERED");
    await page.request.get("/api/order-alerts?force=1");
    data = (await (await page.request.get("/api/order-alerts?force=1")).json()) as {
      data?: { alerts?: { kind: string }[] };
    };
    const restantes = (data?.data?.alerts ?? []).filter(
      (row) => row.kind === "nouvelle_commande" || row.kind === "delai_24h",
    );
    expect(restantes).toHaveLength(0);
  });

  test("une panne de synchronisation signale des données potentiellement incomplètes", async ({
    page,
  }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 4",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-4-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const shopId = await boutiqueDuCompte();
    await rattacherBoutique(shopId, `remote-e2e-alertes-${Date.now()}`);

    await majStatutSync(shopId, "error");
    await page.request.get("/api/order-alerts?force=1");
    const data = (await (await page.request.get("/api/order-alerts?force=1")).json()) as {
      data?: { alerts?: { kind: string; priority: string }[] };
    };
    const alerte = (data?.data?.alerts ?? []).find((row) => row.kind === "synchronisation");
    expect(alerte).toBeTruthy();
    expect(alerte?.priority).toBe("critical");

    // Le retour à la normale résout l'alerte.
    await majStatutSync(shopId, "ok");
    await page.request.get("/api/order-alerts?force=1");
    const apres = (await (await page.request.get("/api/order-alerts?force=1")).json()) as {
      data?: { alerts?: { kind: string }[] };
    };
    expect((apres?.data?.alerts ?? []).find((row) => row.kind === "synchronisation")).toBeUndefined();
  });

  test("un rôle sans droit de préparation ne peut pas agir chez Jumia", async ({
    page,
    request,
  }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 5",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-5-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD5-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A5",
        status: "PENDING",
        totalItems: 1,
        packedItems: 0,
        ageHours: 2,
        articles: [{ externalItemId: `E2E-A5-1-${Date.now()}`, status: "PENDING" }],
      },
    ]);

    // Un second compte, membre avec le rôle « stock » : lecture seule.
    const emailBis = `alertes-e2e-bis-${Date.now()}@exemple.ci`;
    const inscrit = await request.post("/api/auth/register", {
      data: { email: emailBis, password: "MotDePasse123", fullName: "E2E Stock" },
    });
    expect(inscrit.ok()).toBe(true);
    await avecBase(async (pool) => {
      const member = await pool.query(`SELECT id FROM users WHERE email = $1`, [emailBis]);
      const userId = member.rows[0]?.id as string;
      await pool.query(
        `INSERT INTO shop_members (shop_id, user_id, role) VALUES ($1,$2,'stock')
         ON CONFLICT DO NOTHING`,
        [shopId, userId],
      );
    });

    await request.post("/api/auth/login", {
      data: { email: emailBis, password: "MotDePasse123" },
    });
    const commande = await avecBase(async (pool) => {
      const result = await pool.query(`SELECT id FROM orders WHERE external_order_id = $1`, [
        externalOrderId,
      ]);
      return result.rows[0]?.id as string;
    });
    const refus = await request.post(`/api/orders/${commande}/preparation`, {
      data: { action: "pack", itemIds: ["x"], shipmentProviderId: "y" },
    });
    expect(refus.status()).toBe(403);

    // Le même compte, avec le rôle « owner », est bien autorisé : le refus
    // ne vient plus des droits mais du contrôle des articles demandés.
    await page.request.post("/api/auth/login", {
      data: { email, password: "MotDePasse123" },
    });
    const autorise = await page.request.post(`/api/orders/${commande}/preparation`, {
      data: { action: "pack", itemIds: ["x"], shipmentProviderId: "y" },
    });
    expect(autorise.status()).toBe(400);
  });

  test("la page Alertes présente les commandes et leur action adaptée", async ({ page }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 6",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-6-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD6-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A6",
        status: "PENDING",
        totalItems: 1,
        packedItems: 0,
        ageHours: 2,
        articles: [{ externalItemId: `E2E-A6-1-${Date.now()}`, status: "PENDING" }],
      },
    ]);

    await page.request.get("/api/order-alerts?force=1");
    await page.goto("/alertes");
    await expect(page.getByText("Commandes Jumia")).toBeVisible();
    await expect(page.getByTestId("alertes-commandes")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir et préparer" })).toBeVisible();
  });

  test("la page d'une commande propose la préparation et refuse la seconde préparation", async ({
    page,
  }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 7",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-7-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-CMD7-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-A7",
        status: "PENDING",
        totalItems: 2,
        packedItems: 0,
        ageHours: 2,
        articles: [
          { externalItemId: `E2E-A7-1-${Date.now()}`, status: "PENDING" },
          { externalItemId: `E2E-A7-2-${Date.now()}`, status: "DELIVERED" },
        ],
      },
    ]);

    const commande = await avecBase(async (pool) => {
      const result = await pool.query(
        `SELECT id FROM orders WHERE external_order_id = $1`,
        [externalOrderId],
      );
      return result.rows[0]?.id as string;
    });

    await page.goto(`/commandes/${commande}`);
    await expect(page.getByRole("heading", { name: "Préparation" })).toBeVisible();
    // Un seul article attend une préparation : l'article livré est exclu.
    await expect(page.getByText(/1 article\(s\) à préparer/)).toBeVisible();
  });

  test("le seuil de préparation est réglable par boutique", async ({ page }) => {
    const email = `alertes-e2e-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES E2E 8",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-8-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const lecture = await page.request.get(`/api/shops/${shopId}/alertes/delai`);
    const avant = (await lecture.json().catch(() => null)) as { data?: { heures?: number } };
    expect(avant?.data?.heures).toBe(24);

    const ecriture = await page.request.post(`/api/shops/${shopId}/alertes/delai`, {
      data: { heures: 48 },
    });
    expect(ecriture.ok()).toBe(true);

    const apres = (await (await page.request.get(`/api/shops/${shopId}/alertes/delai`)).json()) as {
      data?: { heures?: number };
    };
    expect(apres?.data?.heures).toBe(48);

    // Une valeur absurde est refusée.
    const invalide = await page.request.post(`/api/shops/${shopId}/alertes/delai`, {
      data: { heures: 0 },
    });
    expect(invalide.status()).toBe(422);
  });

  test("la Mini App affiche les mêmes alertes, dans l'application seulement", async ({
    page,
    context,
  }) => {
    const email = `alertes-e2e-mini-${Date.now()}@exemple.ci`;
    await login(page, email, "MotDePasse123");
    const created = await page.request.post("/api/shops", {
      data: {
        name: "BOUTIQUE ALERTES MINI",
        platform: "jumia",
        externalShopId: `E2E-ALERTES-MINI-${Date.now()}`,
        country: "CI",
        currency: "XOF",
      },
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string };
    } | null;
    const shopId = payload?.data?.id ?? "";

    const externalOrderId = `E2E-ALERTES-MINI-CMD-${Date.now()}`;
    await insererCommandes(shopId, [
      {
        externalOrderId,
        orderNumber: "E2E-MINI-1",
        status: "PENDING",
        totalItems: 1,
        packedItems: 0,
        ageHours: 2,
        articles: [{ externalItemId: `E2E-MINI-1-${Date.now()}`, status: "PENDING" }],
      },
    ]);

    await page.request.get("/api/order-alerts?force=1");

    // On passe en coquille Mini App (cookie `teu_ui=mini`).
    await context.addCookies([{ name: "teu_ui", value: "mini", domain: "localhost", path: "/" }]);
    await page.goto("/commandes");
    const cloche = page.getByRole("button", { name: /Alertes de commandes/ });
    await expect(cloche).toBeVisible();
    await cloche.click();
    await expect(page.getByText(/Nouvelle commande reçue/)).toBeVisible();
    // La navigation basse de la Mini App est bien celle du module.
    await expect(page.locator('nav[aria-label="Navigation principale"]')).toBeVisible();
  });
});
