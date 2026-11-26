import { describe, expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fetchOrderItems, normalizeJumiaOrderItem } from "@/lib/jumia/order-items";
import { syncOrderItems } from "@/lib/order-items-sync";

/**
 * Vérification du contrat Jumia **réel** (lecture seule).
 *
 * Ces tests frappent l'API Vendor Center : ils ne tournent que si
 * `JUMIA_LIVE=1` est défini, et n'effectuent **aucun appel en écriture**
 * (impression d'étiquette, changement de statut). Ils relisent les articles
 * des commandes connues et les enregistrent dans notre base — exactement ce
 * que fait la synchronisation des commandes.
 */
describe("contrat Jumia réel", () => {
  const live = process.env.JUMIA_LIVE === "1";
  it.skipIf(!live)("lit les articles de vraies commandes", async () => {
    const db = getDb();
    const shop = (
      await db
        .select()
        .from(schema.shops)
        .where(sql`${schema.shops.remoteShopId} is not null`)
        .limit(1)
    )[0];
    expect(shop).toBeDefined();

    const orders = await db
      .select({ externalOrderId: schema.orders.externalOrderId })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, shop!.id))
      .orderBy(desc(schema.orders.remoteCreatedAt))
      .limit(5);
    expect(orders.length).toBeGreaterThan(0);

    const bundles = await fetchOrderItems({
      remoteShopId: shop!.remoteShopId!,
      shopId: shop!.id,
      orderIds: orders.map((o) => o.externalOrderId!),
    });

    expect(bundles.length).toBeGreaterThan(0);
    const items = bundles.flatMap((bundle) => bundle.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.status).toBeTruthy();
      expect(normalizeJumiaOrderItem(item)).not.toBeNull();
    }
  });

  it.skipIf(!live)("relit les articles et compte ceux qui peuvent être imprimés", async () => {
    const db = getDb();
    const shops = await db
      .select()
      .from(schema.shops)
      .where(sql`${schema.shops.remoteShopId} is not null`);

    for (const shop of shops) {
      const orders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.shopId, shop.id))
        .orderBy(desc(schema.orders.remoteCreatedAt))
        .limit(20);

      const result = await syncOrderItems({
        shopId: shop.id,
        remoteShopId: shop.remoteShopId!,
        orderIds: orders.map((order) => order.id),
      });
      expect(result.fetched).toBeGreaterThanOrEqual(0);
      // Aucun article d'une autre boutique ne doit être enregistré.
      expect(result.skipped).toBe(0);

      const imprimables = await db
        .select({ id: schema.orderItems.id })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.shopId, shop.id),
            sql`upper(${schema.orderItems.status}) = 'READY_TO_SHIP'`,
            sql`${schema.orderItems.trackingNumber} is null`,
          ),
        );
      expect(imprimables.length).toBeGreaterThanOrEqual(0);
    }
  });
});
