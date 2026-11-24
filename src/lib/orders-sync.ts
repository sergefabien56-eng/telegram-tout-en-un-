import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getDb, schema } from "@/db";
import { fetchAllOrderPages } from "@/lib/jumia/orders";
import { normalizeOrder, upsertOrders } from "@/lib/orders";

export type SyncResult = {
  ok: boolean;
  reason?: string;
  orders?: number;
  inserted?: number;
  updated?: number;
  pages?: number;
  truncated?: boolean;
};

/** Formate une date en `YYYY-MM-DD` (UTC), format attendu par Jumia. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MAX_DAYS = 90; // la plage Jumia est limitée à 3 mois
const DEFAULT_DAYS = 30;
const MAX_PAGES = 5;

/**
 * Synchronise les commandes d'une boutique rattachée sur les `days` derniers jours.
 *
 * Verrou par boutique (`shops.sync_in_progress`) : impossible de lancer deux
 * synchronisations simultanées sur la même boutique.
 */
export async function syncShopOrders(params: {
  userId: string;
  shopId: string;
  days?: number;
  requestMeta?: { ip?: string; userAgent?: string | null };
}): Promise<SyncResult> {
  const db = getDb();
  const days = Math.min(Math.max(Math.round(params.days ?? DEFAULT_DAYS), 1), MAX_DAYS);

  let lockReleased = false;
  async function releaseLock() {
    if (lockReleased) return;
    lockReleased = true;
    await db
      .update(schema.shops)
      .set({ syncInProgress: false })
      .where(eq(schema.shops.id, params.shopId));
  }

  const shops = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = shops[0];
  if (!shop) return { ok: false, reason: "Boutique introuvable." };

  const remoteShopId = shop.remoteShopId;
  if (!remoteShopId) {
    return {
      ok: false,
      reason: "Cette boutique n'est pas encore rattachée à une boutique Jumia.",
    };
  }

  // Verrou : une seule synchronisation par boutique. La condition dans le WHERE
  // rend l'opération atomique — pas de course entre deux lancements simultanés.
  const locked = await db
    .update(schema.shops)
    .set({ syncInProgress: true })
    .where(and(eq(schema.shops.id, params.shopId), eq(schema.shops.syncInProgress, false)))
    .returning({ id: schema.shops.id });
  if (locked.length === 0) {
    return { ok: false, reason: "Une synchronisation est déjà en cours pour cette boutique." };
  }

  const before = new Date();
  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const { orders, pages, truncated } = await fetchAllOrderPages({
      shopId: remoteShopId,
      createdAfter: isoDate(after),
      createdBefore: isoDate(before),
      size: 200,
      sort: "DESC",
      maxPages: MAX_PAGES,
    });

    const normalized = orders.flatMap((raw) => {
      const row = normalizeOrder(params.shopId, raw);
      return row ? [row] : [];
    });
    const { inserted, updated } = await upsertOrders(normalized);

    await db
      .update(schema.shops)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        syncInProgress: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.shops.id, params.shopId));

    await audit({
      action: "shop.orders_synced",
      result: "success",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: {
        days,
        fetched: orders.length,
        inserted,
        updated,
        pages,
        truncated,
      },
    });

    await releaseLock();
    return {
      ok: true,
      orders: orders.length,
      inserted,
      updated,
      pages,
      truncated,
    };
  } catch (error) {
    await db
      .update(schema.shops)
      .set({ lastSyncStatus: "error", updatedAt: new Date() })
      .where(eq(schema.shops.id, params.shopId));
    await releaseLock();

    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await audit({
      action: "shop.orders_synced",
      result: "failure",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: { days, error: message.slice(0, 300) },
    });

    return { ok: false, reason: message };
  }
}
