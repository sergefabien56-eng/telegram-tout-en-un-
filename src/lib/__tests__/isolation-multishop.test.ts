import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { upsertOrders } from "@/lib/orders";
import { upsertProductSets } from "@/lib/catalog";
import { connectionStates } from "@/lib/connection-state";

/**
 * ISOLATION MULTIBOUTIQUE — preuve sur la base réelle.
 *
 * On crée un utilisateur, deux boutiques, et on vérifie que :
 * - un lot multi-boutiques est refusé ;
 * - les commandes et produits d'une boutique n'apparaissent jamais chez
 *   l'autre ;
 * - l'état de connexion est calculé boutique par boutique.
 *
 * Tests ignorés si aucune base n'est configurée (CI).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("isolation multiboutique (base réelle)", () => {
  const suffix = Date.now();
  let userId = "";
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `isolation-${suffix}@exemple.ci`,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Test Isolation",
      })
      .returning({ id: schema.users.id });
    userId = user?.id ?? "";

    const [a] = await db
      .insert(schema.shops)
      .values({
        name: "Boutique A",
        platform: "jumia",
        externalShopId: `ISO-A-${suffix}`,
        country: "CI",
        currency: "XOF",
        ownerUserId: userId,
        status: "pending",
      })
      .returning({ id: schema.shops.id });
    shopA = a?.id ?? "";

    const [b] = await db
      .insert(schema.shops)
      .values({
        name: "Boutique B",
        platform: "jumia",
        externalShopId: `ISO-B-${suffix}`,
        country: "CI",
        currency: "XOF",
        ownerUserId: userId,
        status: "pending",
      })
      .returning({ id: schema.shops.id });
    shopB = b?.id ?? "";
  });

  it("enregistre les commandes d'une boutique sans toucher l'autre", async () => {
    await upsertOrders([
      {
        shopId: shopA,
        externalOrderId: `cmd-a-${suffix}`,
        orderNumber: `A-${suffix}`,
        status: "PENDING",
        currency: "XOF",
        totalAmountMinor: 5000,
        raw: { id: `cmd-a-${suffix}`, shopIds: ["boutique-a"] },
      } as never,
    ]);

    const db = getDb();
    const inA = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, shopA));
    const inB = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, shopB));

    expect(inA.length).toBe(1);
    expect(inB.length).toBe(0);
  });

  it("enregistre les produits d'une boutique sans toucher l'autre", async () => {
    await upsertProductSets([
      {
        product: {
          shopId: shopB,
          externalProductId: `prod-b-${suffix}`,
          name: "Produit B",
          currency: "XOF",
          priceMinor: 2500,
          raw: { id: `prod-b-${suffix}`, shop: { id: "boutique-b" } },
        } as never,
        variants: [],
      },
    ]);

    const db = getDb();
    const inA = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.shopId, shopA));
    const inB = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.shopId, shopB));

    expect(inA.length).toBe(0);
    expect(inB.length).toBe(1);
  });

  it("refuse un lot de commandes couvrant les deux boutiques", async () => {
    await expect(
      upsertOrders([
        {
          shopId: shopA,
          externalOrderId: `cmd-x-${suffix}`,
          orderNumber: `X-${suffix}`,
          status: "PENDING",
          currency: "XOF",
          totalAmountMinor: 1,
          raw: { id: `cmd-x-${suffix}` },
        } as never,
        {
          shopId: shopB,
          externalOrderId: `cmd-y-${suffix}`,
          orderNumber: `Y-${suffix}`,
          status: "PENDING",
          currency: "XOF",
          totalAmountMinor: 1,
          raw: { id: `cmd-y-${suffix}` },
        } as never,
      ]),
    ).rejects.toThrow(/multi-boutiques refusé/);
  });

  it("calcule un état de connexion distinct pour chaque boutique", async () => {
    const states = await connectionStates([shopA, shopB]);
    // Boutique A : une commande reçue, mais aucun lien Jumia.
    expect(states.get(shopA)?.state).toBe("non_rattachee");
    // Boutique B : un produit reçu, aucun lien Jumia non plus.
    expect(states.get(shopB)?.state).toBe("non_rattachee");
    // Aucune des deux n'est « opérationnelle » sans rattachement ni compte.
    expect(states.get(shopA)?.operational).toBe(false);
    expect(states.get(shopB)?.operational).toBe(false);
  });

  it("conserve les commandes de chaque boutique dans sa propre volumétrie", async () => {
    const db = getDb();
    const rows = await db
      .select({ shopId: schema.orders.shopId, id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopA),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]?.shopId).toBe(shopA);
  });
});
