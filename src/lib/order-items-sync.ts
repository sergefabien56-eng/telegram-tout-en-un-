import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fetchOrderItems, ORDER_ITEMS_BATCH } from "@/lib/jumia/order-items";
import { normalizeOrderItem, upsertOrderItems, type OrderItemInsert } from "@/lib/order-items";
import { belongsToShop } from "@/lib/shop-guard";

export type OrderItemsSyncResult = {
  /** Articles reçus de Jumia. */
  fetched: number;
  inserted: number;
  updated: number;
  /** Articles écartés : ils portent l'identifiant d'une autre boutique. */
  skipped: number;
  /** Commandes dont les articles n'ont pas pu être lus. */
  failed: number;
};

/**
 * Relit les **articles** de commandes (`GET /orders/items`) et les enregistre.
 *
 * L'appel est idempotent : les articles sont upsertés par
 * (commande, identifiant distant). Un article portant l'identifiant d'une
 * autre boutique est écarté — jamais enregistré sous celle-ci.
 */
export async function syncOrderItems(params: {
  /** Boutique **locale** (porteur du jeton). */
  shopId: string;
  /** Boutique **distant** (filtre Jumia). */
  remoteShopId: string;
  /** Identifiants **locaux** des commandes. */
  orderIds: string[];
  accountId?: string;
}): Promise<OrderItemsSyncResult> {
  const result: OrderItemsSyncResult = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const localOrderIds = params.orderIds.filter((id) => id.length > 0);
  if (localOrderIds.length === 0) return result;

  const db = getDb();
  const orders = await db
    .select({ id: schema.orders.id, externalOrderId: schema.orders.externalOrderId })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, params.shopId),
        inArray(schema.orders.id, localOrderIds),
      ),
    );

  const parExternal = new Map<string, string>();
  for (const order of orders) {
    if (order.externalOrderId) parExternal.set(order.externalOrderId, order.id);
  }
  if (parExternal.size === 0) return result;

  const externalIds = [...parExternal.keys()];

  // L'API accepte plusieurs commandes par appel (paramètres répétés) : on
  // regroupe pour rester largement sous les quotas de Jumia.
  for (let index = 0; index < externalIds.length; index += ORDER_ITEMS_BATCH) {
    const batch = externalIds.slice(index, index + ORDER_ITEMS_BATCH);
    let bundles;
    try {
      bundles = await fetchOrderItems({
        remoteShopId: params.remoteShopId,
        shopId: params.shopId,
        orderIds: batch,
      });
    } catch {
      result.failed += batch.length;
      continue;
    }

    const rows: OrderItemInsert[] = [];
    for (const bundle of bundles) {
      const orderId = parExternal.get(bundle.orderId);
      if (!orderId) continue;
      for (const item of bundle.items) {
        result.fetched += 1;
        // Article portant l'identifiant d'une autre boutique : écarté.
        if (!belongsToShop(item.shopId, params.remoteShopId)) {
          result.skipped += 1;
          continue;
        }
        rows.push(normalizeOrderItem({ shopId: params.shopId, orderId, raw: item }));
      }
    }

    const upsert = await upsertOrderItems(rows);
    result.inserted += upsert.inserted;
    result.updated += upsert.updated;
  }

  return result;
}
