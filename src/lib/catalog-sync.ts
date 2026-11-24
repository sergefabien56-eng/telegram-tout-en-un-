import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getDb, schema } from "@/db";
import { fetchAllProductPages, fetchAllStockPages } from "@/lib/jumia/catalog";
import { applyStocks, normalizeProductSet, upsertProductSets } from "@/lib/catalog";

export type CatalogSyncKind = "products" | "stocks" | "all";

export type CatalogSyncResult = {
  ok: boolean;
  reason?: string;
  products?: number;
  productInserted?: number;
  productUpdated?: number;
  pages?: number;
  truncated?: boolean;
  stockMatched?: number;
  stockMissing?: number;
};

const MAX_PAGES = 5;
const PAGE_SIZE = 100;

/**
 * Synchronise le catalogue et/ou les stocks d'une boutique rattachée.
 *
 * Le verrou est le même que pour les commandes : pas de synchronisation
 * simultanée sur une boutique. Limite de 5 pages de 100 pour préserver le
 * quota Jumia (200 requêtes/minute).
 */
export async function syncShopCatalog(params: {
  userId: string;
  shopId: string;
  kind: CatalogSyncKind;
  requestMeta?: { ip?: string; userAgent?: string | null };
}): Promise<CatalogSyncResult> {
  const db = getDb();

  const shopRows = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = shopRows[0];
  if (!shop) return { ok: false, reason: "Boutique introuvable." };
  if (!shop.remoteShopId) {
    return { ok: false, reason: "Cette boutique n'est pas encore rattachée à une boutique Jumia." };
  }

  const locked = await db
    .update(schema.shops)
    .set({ syncInProgress: true })
    .where(and(eq(schema.shops.id, params.shopId), eq(schema.shops.syncInProgress, false)))
    .returning({ id: schema.shops.id });
  if (locked.length === 0) {
    return { ok: false, reason: "Une synchronisation est déjà en cours pour cette boutique." };
  }

  let released = false;
  async function releaseLock() {
    if (released) return;
    released = true;
    await db
      .update(schema.shops)
      .set({ syncInProgress: false })
      .where(eq(schema.shops.id, params.shopId));
  }

  try {
    let productsCount = 0;
    let productInserted = 0;
    let productUpdated = 0;
    let pages = 0;
    let truncated = false;

    if (params.kind === "products" || params.kind === "all") {
      const fetched = await fetchAllProductPages({
        shopId: shop.remoteShopId,
        size: PAGE_SIZE,
        maxPages: MAX_PAGES,
      });
      const normalized = fetched.products.flatMap((raw) => {
        const row = normalizeProductSet({
          shopId: params.shopId,
          countryCode: shop.country ?? null,
          raw,
        });
        return row ? [row] : [];
      });
      const counts = await upsertProductSets(normalized);
      productsCount = fetched.products.length;
      productInserted = counts.inserted;
      productUpdated = counts.updated;
      pages = fetched.pages;
      truncated = fetched.truncated;
    }

    let stockMatched = 0;
    let stockMissing = 0;
    if (params.kind === "stocks" || params.kind === "all") {
      const stocks = await fetchAllStockPages({ size: PAGE_SIZE, maxPages: MAX_PAGES });
      const applied = await applyStocks(params.shopId, stocks.stocks);
      stockMatched = applied.matched;
      stockMissing = applied.missing;
      pages = Math.max(pages, stocks.pages);
      truncated = truncated || stocks.truncated;
    }

    await releaseLock();
    await audit({
      action: params.kind === "stocks" ? "shop.stocks_synced" : "shop.products_synced",
      result: "success",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: {
        kind: params.kind,
        products: productsCount,
        productInserted,
        productUpdated,
        pages,
        truncated,
        stockMatched,
        stockMissing,
      },
    });

    return {
      ok: true,
      products: productsCount,
      productInserted,
      productUpdated,
      pages,
      truncated,
      stockMatched,
      stockMissing,
    };
  } catch (error) {
    await releaseLock();
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await audit({
      action: params.kind === "stocks" ? "shop.stocks_synced" : "shop.products_synced",
      result: "failure",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: { kind: params.kind, error: message.slice(0, 300) },
    });
    return { ok: false, reason: message };
  }
}
