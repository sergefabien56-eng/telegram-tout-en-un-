import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { toMinorUnits } from "@/lib/orders";

export type ProductInsert = typeof schema.products.$inferInsert;
export type VariantInsert = typeof schema.productVariants.$inferInsert;
export type ProductRow = typeof schema.products.$inferSelect;
export type VariantRow = typeof schema.productVariants.$inferSelect;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Client commercial du pays de la boutique (ex. CI), sinon le premier. */
function pickBusinessClient<T>(clients: T[], countryCode: string | null | undefined): T | null {
  if (clients.length === 0) return null;
  if (!countryCode) return clients[0] ?? null;
  return (
    clients.find((client) => (client as { countryCode?: unknown }).countryCode === countryCode) ??
    clients[0] ??
    null
  );
}

/**
 * Normalise un ensemble produit GPM et ses déclinaisons.
 *
 * Retourne `null` si l'identifiant ou le nom manque (R1). Les prix deviennent
 * des entiers d'unités mineures selon leur devise (R3).
 */
export function normalizeProductSet(params: {
  shopId: string;
  countryCode: string | null;
  raw: unknown;
}): { product: ProductInsert; variants: Omit<VariantInsert, "productId">[] } | null {
  const product = params.raw as {
    id?: unknown;
    name?: unknown;
    parentSku?: unknown;
    brand?: { name?: unknown };
    category?: { code?: unknown; name?: unknown };
    images?: { url?: unknown; primary?: unknown }[];
    variations?: unknown[];
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const externalProductId = asString(product.id);
  const name = asString(product.name);
  if (!externalProductId || !name) return null;

  const primaryImage =
    product.images?.find((image) => image.primary === true)?.url ??
    product.images?.[0]?.url ??
    null;

  const variants = (Array.isArray(product.variations) ? product.variations : []).flatMap(
    (entry): Omit<VariantInsert, "productId">[] => {
      const variation = entry as {
        id?: unknown;
        sellerSku?: unknown;
        barcodeEan?: unknown;
        variation?: unknown;
        globalPrice?: { currency?: unknown; value?: unknown; salePrice?: { value?: unknown } };
        businessClients?: unknown[];
      };
      const externalVariantId = asString(variation.id);
      if (!externalVariantId) return [];

      const client = pickBusinessClient(
        Array.isArray(variation.businessClients) ? variation.businessClients : [],
        params.countryCode,
      ) as {
        sku?: unknown;
        status?: unknown;
        visible?: unknown;
        qc?: { status?: unknown };
        price?: {
          localCurrency?: unknown;
          localValue?: unknown;
          currency?: unknown;
          value?: unknown;
          salePrice?: { value?: unknown };
        };
      } | null;

      const localCurrency = asString(client?.price?.localCurrency) ?? "XOF";
      const price = toMinorUnits(client?.price?.localValue, localCurrency);
      // Prix « global » exprimé en USD chez Jumia ; conservé tel quel.
      const usdCurrency = asString(variation.globalPrice?.currency) ?? "USD";
      const globalPrice = toMinorUnits(variation.globalPrice?.value, usdCurrency);

      return [
        {
          externalVariantId,
          sellerSku: asString(variation.sellerSku),
          barcodeEan: asString(variation.barcodeEan),
          variationName: asString(variation.variation),
          currency: localCurrency,
          priceMinor: price ?? globalPrice,
          salePriceMinor: toMinorUnits(client?.price?.salePrice?.value, localCurrency),
          status: asString(client?.status),
          visible: asBool(client?.visible),
          qcStatus: asString(client?.qc?.status),
          syncedAt: new Date(),
          raw: entry as Record<string, unknown>,
        },
      ];
    },
  );

  return {
    product: {
      shopId: params.shopId,
      externalProductId,
      parentSku: asString(product.parentSku),
      name,
      brandName: asString(product.brand?.name),
      categoryCode: asString(product.category?.code),
      categoryName: asString(product.category?.name),
      primaryImage: asString(primaryImage),
      status: variants[0]?.status ?? null,
      qcStatus: variants[0]?.qcStatus ?? null,
      remoteCreatedAt: asDate(product.createdAt),
      remoteUpdatedAt: asDate(product.updatedAt),
      raw: params.raw as Record<string, unknown>,
      syncedAt: new Date(),
    },
    variants,
  };
}

/**
 * Enregistre un ensemble produit et ses déclinaisons (upsert idempotent).
 * Les identifiants externes sont relus avant écriture pour compter
 * insertions / mises à jour.
 */
export async function upsertProductSets(
  rows: { product: ProductInsert; variants: Omit<VariantInsert, "productId">[] }[],
): Promise<{ processed: number; inserted: number; updated: number }> {
  const firstRow = rows[0];
  if (!firstRow) return { processed: 0, inserted: 0, updated: 0 };
  const db = getDb();

  const shopId = firstRow.product.shopId;
  const externalIds = rows.map((row) => row.product.externalProductId);
  const existing = new Map(
    (
      await db
        .select({ id: schema.products.id, externalId: schema.products.externalProductId })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.shopId, shopId),
            inArray(schema.products.externalProductId, externalIds),
          ),
        )
    ).map((row) => [row.externalId, row.id]),
  );

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const knownProductId = existing.get(row.product.externalProductId);
    // Upsert à chaque passage : le nom, l'image et le statut peuvent changer.
    const productRow = (
      await db
        .insert(schema.products)
        .values(row.product)
        .onConflictDoUpdate({
          target: [schema.products.shopId, schema.products.externalProductId],
          set: {
            parentSku: row.product.parentSku,
            name: row.product.name,
            brandName: row.product.brandName,
            categoryCode: row.product.categoryCode,
            categoryName: row.product.categoryName,
            primaryImage: row.product.primaryImage,
            status: row.product.status,
            qcStatus: row.product.qcStatus,
            remoteCreatedAt: row.product.remoteCreatedAt,
            remoteUpdatedAt: row.product.remoteUpdatedAt,
            raw: row.product.raw,
            syncedAt: row.product.syncedAt,
          },
        })
        .returning({ id: schema.products.id })
    )[0];
    const productId = productRow?.id;
    if (!productId) continue;

    if (knownProductId) updated += 1;
    else inserted += 1;

    for (const variant of row.variants) {
      await db
        .insert(schema.productVariants)
        .values({ ...variant, productId })
        .onConflictDoUpdate({
          target: [schema.productVariants.productId, schema.productVariants.externalVariantId],
          set: {
            sellerSku: variant.sellerSku,
            barcodeEan: variant.barcodeEan,
            variationName: variant.variationName,
            currency: variant.currency,
            priceMinor: variant.priceMinor,
            salePriceMinor: variant.salePriceMinor,
            status: variant.status,
            visible: variant.visible,
            qcStatus: variant.qcStatus,
            raw: variant.raw,
            syncedAt: variant.syncedAt,
          },
        });
    }
  }

  return { processed: rows.length, inserted, updated };
}

/** Met à jour les stocks des déclinaisons par `sellerSku`. */
export async function applyStocks(
  shopId: string,
  stocks: unknown[],
): Promise<{ matched: number; missing: number }> {
  const db = getDb();
  const normalized = stocks.flatMap((entry) => {
    const stock = entry as {
      sellerSku?: unknown;
      globalStock?: unknown;
      lastStockUpdatedAt?: unknown;
    };
    const sellerSku = asString(stock.sellerSku);
    if (!sellerSku) return [];
    return [
      { sellerSku, stock: asInt(stock.globalStock), updatedAt: asDate(stock.lastStockUpdatedAt) },
    ];
  });

  if (normalized.length === 0) return { matched: 0, missing: 0 };

  const skus = normalized.map((row) => row.sellerSku);
  const variants = await db
    .select({
      id: schema.productVariants.id,
      sellerSku: schema.productVariants.sellerSku,
    })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(
      and(eq(schema.products.shopId, shopId), inArray(schema.productVariants.sellerSku, skus)),
    );

  const bySku = new Map(variants.map((variant) => [variant.sellerSku, variant.id]));

  let matched = 0;
  for (const row of normalized) {
    const variantId = row.sellerSku ? bySku.get(row.sellerSku) : undefined;
    if (!variantId) continue;
    await db
      .update(schema.productVariants)
      .set({
        stockGlobal: row.stock ?? null,
        stockUpdatedAt: row.updatedAt ?? new Date(),
        syncedAt: new Date(),
      })
      .where(eq(schema.productVariants.id, variantId));
    matched += 1;
  }

  return { matched, missing: normalized.length - matched };
}

/** Catalogue enregistré pour une boutique, avec le stock total par produit. */
export async function listProducts(shopId: string, limit = 100): Promise<ProductRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.products)
    .where(eq(schema.products.shopId, shopId))
    .orderBy(desc(schema.products.remoteCreatedAt), desc(schema.products.syncedAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/** Déclinaisons d'une boutique, avec le nom du produit (écran Stocks). */
export async function listVariants(
  shopId: string,
  limit = 200,
): Promise<{ variant: VariantRow; productName: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ variant: schema.productVariants, productName: schema.products.name })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(eq(schema.products.shopId, shopId))
    .orderBy(desc(schema.productVariants.stockUpdatedAt))
    .limit(Math.min(Math.max(limit, 1), 1000));

  return rows.map((row) => ({ variant: row.variant, productName: row.productName }));
}
