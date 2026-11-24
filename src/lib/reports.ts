import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

type Window = { from: Date; to: Date };

export type ReportRow = {
  period: string;
  revenueMinor: number;
  orders: number;
  canceledOrders: number;
  units: number;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Découpe la fenêtre en jours (UTC) ; le dernier jour est inclus. */
export function daysOf(window: Window): string[] {
  const days: string[] = [];
  const cursor = new Date(
    Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), window.from.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()),
  );
  let guard = 0;
  while (cursor <= last && guard < 400) {
    days.push(isoDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

/**
 * Rapport des ventes : uniquement les montants de commandes déjà enregistrés.
 * Aucune estimation : un jour sans commande apparaît à zéro.
 */
export async function reportSales(
  shopId: string,
  window: Window,
  options: { statusFilter?: string[] } = {},
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, shopId),
        gte(schema.orders.remoteCreatedAt, window.from),
        lte(schema.orders.remoteCreatedAt, window.to),
      ),
    )
    .orderBy(desc(schema.orders.remoteCreatedAt));

  const filter = options.statusFilter ?? ["DELIVERED", "SHIPPED"];
  const counted = rows.filter((row) => filter.includes(row.status));

  const byDay = new Map<string, ReportRow>();
  for (const day of daysOf(window)) {
    byDay.set(day, { period: day, revenueMinor: 0, orders: 0, canceledOrders: 0, units: 0 });
  }

  for (const row of rows) {
    if (!row.remoteCreatedAt) continue;
    const entry = byDay.get(isoDay(row.remoteCreatedAt));
    if (!entry) continue;
    if (row.status === "CANCELED") entry.canceledOrders += 1;
    else if (filter.includes(row.status)) {
      entry.revenueMinor += row.totalAmountMinor;
      entry.orders += 1;
      entry.units += row.totalItems ?? 0;
    }
  }

  const series = [...byDay.values()].sort((a, b) => a.period.localeCompare(b.period));
  const totals = series.reduce(
    (acc, row) => ({
      revenueMinor: acc.revenueMinor + row.revenueMinor,
      orders: acc.orders + row.orders,
      canceledOrders: acc.canceledOrders + row.canceledOrders,
      units: acc.units + row.units,
    }),
    { revenueMinor: 0, orders: 0, canceledOrders: 0, units: 0 },
  );

  const topOrders = counted.slice(0, 5).map((row) => ({
    orderNumber: row.orderNumber,
    createdAt: row.remoteCreatedAt,
    status: row.status,
    totalMinor: row.totalAmountMinor,
    currency: row.currency,
    customerCity: row.customerCity,
  }));

  return { series, totals, topOrders, from: isoDay(window.from), to: isoDay(window.to) };
}

/** Répartition du catalogue par statut et stock total, chiffres déjà enregistrés. */
export async function reportCatalog(shopId: string) {
  const db = getDb();

  const productRows = await db
    .select({
      status: schema.products.status,
      count: getDbCount(),
    })
    .from(schema.products)
    .where(eq(schema.products.shopId, shopId))
    .groupBy(schema.products.status);

  const variants = await db
    .select({
      stock: schema.productVariants.stockGlobal,
      price: schema.productVariants.priceMinor,
      sku: schema.productVariants.sellerSku,
      productName: schema.products.name,
      brand: schema.products.brandName,
      category: schema.products.categoryName,
    })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(eq(schema.products.shopId, shopId))
    .orderBy(asc(schema.productVariants.stockGlobal));

  const knownStock = variants.filter((row) => row.stock !== null);
  const lowStock = knownStock.filter((row) => (row.stock ?? 0) <= 5).length;
  const stockValueMinor = knownStock.reduce(
    (total, row) =>
      row.price === null || row.stock === null ? total : total + row.price * row.stock,
    0,
  );

  return {
    productsByStatus: productRows.map((row) => ({
      status: row.status ?? "—",
      count: Number(row.count),
    })),
    variants: variants.length,
    stockUnits: knownStock.reduce((total, row) => total + (row.stock ?? 0), 0),
    lowStock,
    stockValueMinor,
    // Les plus petites quantités d'abord : ce sont celles à réapprovisionner.
    lowestStock: variants
      .filter((row) => row.stock !== null && row.sku)
      .slice(0, 5)
      .map((row) => ({
        sellerSku: row.sku,
        name: row.productName,
        brand: row.brand,
        category: row.category,
        stock: row.stock,
        priceMinor: row.price,
      })),
  };
}

function getDbCount() {
  return sql<number>`count(*)::int`;
}
