import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { listOrders, normalizeOrder, upsertOrders } from "@/lib/orders";

/** Tests d'intégration commandes sur la base réelle (ignorés en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("commandes : import idempotent (base réelle)", () => {
  const suffix = Date.now();
  const ownerEmail = `orders-${suffix}@exemple.ci`;
  let ownerId = "";
  let shopId = "";

  const raw = {
    id: "41ea7c3b-20f0-466d-a095-e6e909298180",
    number: `T-${suffix}`,
    status: "PENDING",
    totalAmount: { currency: "USD", value: 12.34 },
    totalAmountLocal: { currency: "XOF", value: 8200 },
    country: { code: "CI" },
    shippingAddress: { firstName: "Awa", lastName: "Traoré", city: "Abidjan" },
    totalItems: 2,
    packedItems: 1,
    isPrepayment: false,
    hasMultipleStatus: false,
    deliveryOption: "Flat Rate",
    createdAt: "2026-11-20T10:15:00Z",
    updatedAt: "2026-11-21T08:00:00Z",
  };

  beforeAll(async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.users)
      .values({
        email: ownerEmail,
        passwordHash: await hashPassword("MotDePasse123"),
        fullName: "Test Commandes",
      })
      .returning({ id: schema.users.id });
    const firstUser = inserted[0];
    if (!firstUser) throw new Error("Création utilisateur impossible.");
    ownerId = firstUser.id;
    const shop = await db
      .insert(schema.shops)
      .values({
        ownerUserId: ownerId,
        name: "SHOP COMMANDES TEST",
        platform: "jumia",
        externalShopId: `ORDERS-${suffix}`,
        remoteShopId: `remote-${suffix}`,
      })
      .returning({ id: schema.shops.id });
    const firstShop = shop[0];
    if (!firstShop) throw new Error("Création boutique impossible.");
    shopId = firstShop.id;
  });

  it("insère puis met à jour sans doublon", async () => {
    const row = normalizeOrder(shopId, raw);
    expect(row).not.toBeNull();

    const first = await upsertOrders([row!]);
    expect(first.inserted).toBe(1);
    expect(first.updated).toBe(0);

    const second = await upsertOrders([{ ...row!, status: "SHIPPED" }]);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(1);

    const stored = await listOrders(shopId);
    expect(stored).toHaveLength(1);
    const order = stored[0];
    expect(order?.status).toBe("SHIPPED");
    expect(order?.totalAmountMinor).toBe(8200);
    expect(order?.currency).toBe("XOF");
  });

  it("nettoie ses données de test", async () => {
    const db = getDb();
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
  });
});
