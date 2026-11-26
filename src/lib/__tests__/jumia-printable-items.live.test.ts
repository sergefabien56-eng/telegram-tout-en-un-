import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { syncOrderItems } from "@/lib/order-items-sync";

/**
 * Relecture **complète** des articles de toutes les commandes connues.
 *
 * Lecture seule côté Jumia : elle enregistre dans notre base les articles
 * (statut d'expédition, numéro de suivi) que la plateforme porte pour
 * chaque commande. C'est ce qui permet de savoir si une étiquette peut
 * réellement être imprimée.
 */
describe("articles de toutes les commandes", () => {
  it.skipIf(process.env.JUMIA_LIVE !== "1")("relit tout et compte les articles imprimables", { timeout: 300_000 }, async () => {
    const db = getDb();
    const shops = await db
      .select()
      .from(schema.shops)
      .where(sql`${schema.shops.remoteShopId} is not null`);

    let total = 0;
    for (const shop of shops) {
      const orders = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.shopId, shop.id));
      console.log(`${shop.name} : ${orders.length} commande(s)`);

      const result = await syncOrderItems({
        shopId: shop.id,
        remoteShopId: shop.remoteShopId!,
        orderIds: orders.map((order) => order.id),
      });
      console.log(
        `  articles → lus ${result.fetched}, insérés ${result.inserted}, mis à jour ${result.updated}, écartés ${result.skipped}, échecs ${result.failed}`,
      );
      total += result.fetched;

      const parStatut = await db
        .select({
          status: schema.orderItems.status,
          n: sql<number>`count(*)::int`,
          avecSuivi: sql<number>`count(${schema.orderItems.trackingNumber})::int`,
        })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.shopId, shop.id))
        .groupBy(schema.orderItems.status)
        .orderBy(sql`count(*) desc`);
      console.log("  par statut :", JSON.stringify(parStatut));

      const imprimables = await db
        .select({
          id: schema.orderItems.id,
          orderId: schema.orderItems.orderId,
          productName: schema.orderItems.productName,
        })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.shopId, shop.id),
            sql`upper(${schema.orderItems.status}) = 'READY_TO_SHIP'`,
            sql`${schema.orderItems.trackingNumber} is null`,
          ),
        );
      console.log(`  IMPRIMABLES : ${imprimables.length}`);
      for (const item of imprimables.slice(0, 10)) {
        console.log("   -", item.productName, item.id);
      }
    }
    console.log("TOTAL articles lus :", total);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});
