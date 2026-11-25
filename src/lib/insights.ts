import { and, count, countDistinct, desc, eq, gte, inArray, lte, max, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Membres des boutiques de l'utilisateur (jamais d'autres comptes). */
export async function listShopMembers(myShopIds: string[]) {
  if (myShopIds.length === 0) return [];
  const db = getDb();
  return db
    .select({
      shopId: schema.shopMembers.shopId,
      shopName: schema.shops.name,
      userId: schema.users.id,
      email: schema.users.email,
      fullName: schema.users.fullName,
      twoFactorEnabled: schema.users.twoFactorEnabled,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
      role: schema.shopMembers.role,
    })
    .from(schema.shopMembers)
    .innerJoin(schema.users, eq(schema.shopMembers.userId, schema.users.id))
    .innerJoin(schema.shops, eq(schema.shopMembers.shopId, schema.shops.id))
    .where(inArray(schema.shopMembers.shopId, myShopIds))
    .orderBy(desc(schema.users.createdAt));
}

/** Compteurs réels par boutique : commandes, produits, variantes, relevés. */
export async function shopCounts(
  shopIds: string[],
): Promise<
  Map<string, { orders: number; products: number; variants: number; statements: number }>
> {
  const empty = new Map<
    string,
    { orders: number; products: number; variants: number; statements: number }
  >();
  if (shopIds.length === 0) return empty;
  const db = getDb();

  const orders = await db
    .select({ shopId: schema.orders.shopId, total: count() })
    .from(schema.orders)
    .where(inArray(schema.orders.shopId, shopIds))
    .groupBy(schema.orders.shopId);
  const products = await db
    .select({ shopId: schema.products.shopId, total: count() })
    .from(schema.products)
    .where(inArray(schema.products.shopId, shopIds))
    .groupBy(schema.products.shopId);
  const variants = await db
    .select({ shopId: schema.products.shopId, total: count(schema.productVariants.id) })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(inArray(schema.products.shopId, shopIds))
    .groupBy(schema.products.shopId);
  const statements = await db
    .select({ shopId: schema.payoutStatements.shopId, total: count() })
    .from(schema.payoutStatements)
    .where(inArray(schema.payoutStatements.shopId, shopIds))
    .groupBy(schema.payoutStatements.shopId);

  const map = new Map<
    string,
    { orders: number; products: number; variants: number; statements: number }
  >();
  for (const id of shopIds) {
    map.set(id, { orders: 0, products: 0, variants: 0, statements: 0 });
  }
  const merge = (
    rows: { shopId: string; total: number }[],
    key: "orders" | "products" | "variants" | "statements",
  ) => {
    for (const row of rows) {
      const entry = map.get(row.shopId);
      if (entry) entry[key] = row.total;
    }
  };
  merge(orders, "orders");
  merge(products, "products");
  merge(variants, "variants");
  merge(statements, "statements");
  return map;
}

/** Catégories réellement présentes dans le catalogue (jamais inventées). */
export type CategoryRow = {
  name: string | null;
  code: string | null;
  products: number;
  variants: number;
};

export async function listCategories(shopIds: string[]): Promise<CategoryRow[]> {
  if (shopIds.length === 0) return [];
  const db = getDb();
  return db
    .select({
      name: schema.products.categoryName,
      code: schema.products.categoryCode,
      products: count(schema.products.id),
      variants: count(schema.productVariants.id),
    })
    .from(schema.products)
    .leftJoin(schema.productVariants, eq(schema.productVariants.productId, schema.products.id))
    .where(inArray(schema.products.shopId, shopIds))
    .groupBy(schema.products.categoryName, schema.products.categoryCode)
    .orderBy(desc(count(schema.products.id)));
}

export type RentabilityRow = {
  shopId: string;
  statements: number;
  revenueMinor: number;
  shipmentFeesMinor: number;
  feesMinor: number;
  refundsMinor: number;
  netMinor: number;
  paidMinor: number;
  currency: string;
};

/** Synthèse des relevés Jumia sur une période (données réelles uniquement). */
export async function rentability(
  shopIds: string[],
  from?: Date,
  to?: Date,
): Promise<RentabilityRow[]> {
  if (shopIds.length === 0) return [];
  const db = getDb();
  const conditions = [inArray(schema.payoutStatements.shopId, shopIds)];
  if (from) conditions.push(gte(schema.payoutStatements.remoteCreatedAt, from));
  if (to) conditions.push(lte(schema.payoutStatements.remoteCreatedAt, to));

  const rows = await db
    .select({
      shopId: schema.payoutStatements.shopId,
      statements: count(),
      currencies: countDistinct(schema.payoutStatements.currency),
      currency: max(schema.payoutStatements.currency),
      revenueMinor: sum(schema.payoutStatements.itemRevenueMinor),
      shipmentFeesMinor: sum(schema.payoutStatements.shipmentFeeMinor),
      feesMinor: sum(schema.payoutStatements.feesTotalMinor),
      refundsMinor: sum(schema.payoutStatements.refundsMinor),
      netMinor: sum(schema.payoutStatements.closingBalanceMinor),
      paidMinor: sum(schema.payoutStatements.payoutAmountMinor),
    })
    .from(schema.payoutStatements)
    .where(and(...conditions))
    .groupBy(schema.payoutStatements.shopId);

  return rows.map((row) => ({
    shopId: row.shopId,
    statements: row.statements,
    revenueMinor: Number(row.revenueMinor ?? 0),
    shipmentFeesMinor: Number(row.shipmentFeesMinor ?? 0),
    feesMinor: Number(row.feesMinor ?? 0),
    refundsMinor: Number(row.refundsMinor ?? 0),
    netMinor: Number(row.netMinor ?? 0),
    paidMinor: Number(row.paidMinor ?? 0),
    // Plusieurs devises sur la période : total non additionné, on le dit.
    currency: row.currencies === 1 && row.currency ? row.currency : "",
  }));
}

/**
 * Dernière synchronisation réussie par boutique et par type
 * (catalogue, commandes, relevés). Données réelles issues de la table `jobs`.
 */
export async function shopSyncHistory(
  shopIds: string[],
): Promise<Map<string, { catalog: Date | null; orders: Date | null; payments: Date | null }>> {
  const empty = new Map<string, { catalog: Date | null; orders: Date | null; payments: Date | null }>();
  if (shopIds.length === 0) return empty;
  const db = getDb();

  const rows = await db
    .select({
      shopId: schema.jobs.shopId,
      type: schema.jobs.type,
      createdAt: schema.jobs.createdAt,
      status: schema.jobs.status,
    })
    .from(schema.jobs)
    .where(inArray(schema.jobs.shopId, shopIds))
    .orderBy(desc(schema.jobs.createdAt));

  for (const id of shopIds) {
    empty.set(id, { catalog: null, orders: null, payments: null });
  }
  for (const row of rows) {
    if (!row.shopId || row.status !== "done") continue;
    const entry = empty.get(row.shopId);
    if (!entry) continue;
    if (row.type === "catalog" && !entry.catalog) entry.catalog = row.createdAt;
    if (row.type === "orders" && !entry.orders) entry.orders = row.createdAt;
    if (row.type === "payments" && !entry.payments) entry.payments = row.createdAt;
  }
  return empty;
}
