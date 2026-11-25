import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listUserShops } from "@/lib/shops";
import { reportCatalog, reportSales } from "@/lib/reports";
import { listPayoutStatements, sumStatements } from "@/lib/payments";

/**
 * Tableau de bord — uniquement des chiffres déjà enregistrés.
 * Les rubriques vides affichent un état explicite, jamais un « 0 » trompeur
 * ni une estimation.
 */

const DAY_MS = 86_400_000;

export type DashboardAlert = {
  kind: "stock" | "paiement" | "tache";
  label: string;
  detail: string;
};

export type DashboardOverview = {
  period: { days: number; from: string; to: string };
  kpis: {
    revenueMinor: number;
    currency: string;
    orders: number;
    canceledOrders: number;
    units: number;
    products: number;
    variants: number;
    lowStock: number;
    unpaidMinor: number;
    paidMinor: number;
  };
  finances: {
    revenueMinor: number;
    feesMinor: number;
    shipmentFeesMinor: number;
    refundsMinor: number;
    netMinor: number;
    paidMinor: number;
    unpaid: boolean;
    statements: number;
    /** Période réellement couverte par les relevés (ils ne suivent pas la période du tableau de bord). */
    statementFrom: string | null;
    statementTo: string | null;
  };
  shops: {
    id: string;
    name: string;
    revenueMinor: number;
    orders: number;
    stockUnits: number;
    lowStock: number;
  }[];
  alerts: DashboardAlert[];
  activity: { action: string; result: string; createdAt: Date }[];
};

export async function dashboardOverview(userId: string, days = 30): Promise<DashboardOverview> {
  const db = getDb();
  const shops = await listUserShops(userId);
  const shopIds = shops.map((shop) => shop.id);

  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);

  if (shopIds.length === 0) {
    return {
      period: { days, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      kpis: {
        revenueMinor: 0,
        currency: "XOF",
        orders: 0,
        canceledOrders: 0,
        units: 0,
        products: 0,
        variants: 0,
        lowStock: 0,
        unpaidMinor: 0,
        paidMinor: 0,
      },
      finances: {
        revenueMinor: 0,
        feesMinor: 0,
        shipmentFeesMinor: 0,
        refundsMinor: 0,
        netMinor: 0,
        paidMinor: 0,
        unpaid: false,
        statements: 0,
        statementFrom: null,
        statementTo: null,
      },
      shops: [],
      alerts: [],
      activity: [],
    };
  }

  // Ventes par boutique (commandes livrées et expédiées).
  const salesByShop = await Promise.all(
    shops.map(async (shop) => ({
      id: shop.id,
      name: shop.name,
      currency: shop.currency ?? "XOF",
      sales: await reportSales(
        shop.id,
        { from, to },
        {
          statusFilter: ["DELIVERED", "SHIPPED"],
        },
      ),
    })),
  );

  // Catalogue et stocks par boutique.
  const catalogByShop = await Promise.all(
    shops.map(async (shop) => ({ id: shop.id, catalog: await reportCatalog(shop.id) })),
  );

  // Relevés Jumia par boutique.
  const statementsByShop = await Promise.all(
    shops.map(async (shop) => ({
      id: shop.id,
      rows: await listPayoutStatements(shop.id, 50),
    })),
  );
  type FinanceAccumulator = {
    revenueMinor: number;
    feesMinor: number;
    shipmentFeesMinor: number;
    refundsMinor: number;
    netMinor: number;
    paidMinor: number;
    unpaid: boolean;
    statements: number;
    statementFrom: string | null;
    statementTo: string | null;
  };

  const finances = statementsByShop.reduce<FinanceAccumulator>((acc, row) => {
    const totals = sumStatements(row.rows);
    const from = row.rows.reduce<Date | null>(
      (min, item) =>
        min === null || item.remoteCreatedAt < min ? item.remoteCreatedAt : min,
      null,
    );
    const to = row.rows.reduce<Date | null>(
      (max, item) =>
        max === null || item.remoteCreatedAt > max ? item.remoteCreatedAt : max,
      null,
    );
    return {
      revenueMinor: acc.revenueMinor + totals.revenue,
      feesMinor: acc.feesMinor + totals.fees,
      shipmentFeesMinor: acc.shipmentFeesMinor + totals.shipmentFees,
      refundsMinor: acc.refundsMinor + totals.refunds,
      netMinor: acc.netMinor + totals.net,
      paidMinor: acc.paidMinor + totals.paid,
      unpaid: acc.unpaid || totals.unpaid,
      statements: acc.statements + row.rows.length,
      statementFrom:
        from && (!acc.statementFrom || from < new Date(acc.statementFrom))
          ? from.toISOString()
          : acc.statementFrom,
      statementTo:
        to && (!acc.statementTo || to > new Date(acc.statementTo))
          ? to.toISOString()
          : acc.statementTo,
    };
  }, {
    revenueMinor: 0,
    feesMinor: 0,
    shipmentFeesMinor: 0,
    refundsMinor: 0,
    netMinor: 0,
    paidMinor: 0,
    unpaid: false,
    statements: 0,
    statementFrom: null,
    statementTo: null,
  });

  // Tâches en échec : alertes prioritaires.
  const failedJobs = await db
    .select({
      type: schema.jobs.type,
      status: schema.jobs.status,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(inArray(schema.jobs.shopId, shopIds))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(50);

  // Le journal porte souvent `entity_id` plutôt que `shop_id` : on retient aussi
  // les actions des utilisateurs rattachés aux boutiques accessibles.
  const memberUsers = await db
    .select({ userId: schema.shopMembers.userId })
    .from(schema.shopMembers)
    .where(inArray(schema.shopMembers.shopId, shopIds));
  const userIds = [...new Set(memberUsers.map((row) => row.userId))];

  const activityRows = await db
    .select({
      action: schema.auditLogs.action,
      result: schema.auditLogs.result,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .where(
      or(
        inArray(schema.auditLogs.shopId, shopIds),
        userIds.length > 0 ? inArray(schema.auditLogs.userId, userIds) : undefined,
      ),
    )
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(8);

  const alerts: DashboardAlert[] = [];
  for (const row of catalogByShop) {
    if (row.catalog.lowStock > 0) {
      alerts.push({
        kind: "stock",
        label: "Stocks faibles",
        detail: `${row.catalog.lowStock} déclinaison(s) à 5 unités ou moins.`,
      });
    }
  }
  for (const row of statementsByShop) {
    const totals = sumStatements(row.rows);
    if (totals.unpaid) {
      alerts.push({
        kind: "paiement",
        label: "Relevé à verser",
        detail: `${Math.max(totals.net, 0).toLocaleString("fr-FR")} FCFA de net cumulé sur ${row.rows.length} relevé(s), au moins un non payé.`,
      });
    }
  }
  const failedCount = failedJobs.filter((job) => job.status === "failed").length;
  if (failedCount > 0) {
    alerts.push({
      kind: "tache",
      label: "Synchronisations en échec",
      detail: `${failedCount} tâche(s) échouée(s) à relancer.`,
    });
  }

  const kpis = {
    revenueMinor: salesByShop.reduce((total, row) => total + row.sales.totals.revenueMinor, 0),
    currency: shops[0]?.currency ?? "XOF",
    orders: salesByShop.reduce((total, row) => total + row.sales.totals.orders, 0),
    canceledOrders: salesByShop.reduce((total, row) => total + row.sales.totals.canceledOrders, 0),
    units: salesByShop.reduce((total, row) => total + row.sales.totals.units, 0),
    products: catalogByShop.reduce(
      (total, row) => total + row.catalog.productsByStatus.reduce((n, p) => n + p.count, 0),
      0,
    ),
    variants: catalogByShop.reduce((total, row) => total + row.catalog.variants, 0),
    lowStock: catalogByShop.reduce((total, row) => total + row.catalog.lowStock, 0),
    unpaidMinor: statementsByShop.reduce((total, row) => {
      const totals = sumStatements(row.rows);
      return total + (totals.unpaid ? Math.max(totals.net, 0) : 0);
    }, 0),
    paidMinor: finances.paidMinor,
  };

  return {
    period: {
      days,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    kpis,
    finances,
    shops: salesByShop.map((row) => {
      const catalog = catalogByShop.find((item) => item.id === row.id)?.catalog;
      return {
        id: row.id,
        name: row.name,
        revenueMinor: row.sales.totals.revenueMinor,
        orders: row.sales.totals.orders,
        stockUnits: catalog?.stockUnits ?? 0,
        lowStock: catalog?.lowStock ?? 0,
      };
    }),
    alerts,
    activity: activityRows,
  };
}

/** Recherche dans l'espace : boutiques accessibles + produits enregistrés. */
export async function searchSpace(userId: string, query: string, limit = 5) {
  const needle = `%${query}%`;
  const db = getDb();
  const shops = await listUserShops(userId);
  const shopIds = shops.map((shop) => shop.id);
  if (shopIds.length === 0) return { shops: [], products: [] };

  const shopRows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      role: schema.shopMembers.role,
    })
    .from(schema.shops)
    .innerJoin(schema.shopMembers, eq(schema.shops.id, schema.shopMembers.shopId))
    .where(and(inArray(schema.shops.id, shopIds), ilike(schema.shops.name, needle)))
    .limit(limit);

  const productRows = await db
    .select({
      productId: schema.products.id,
      name: schema.products.name,
      brand: schema.products.brandName,
      sellerSku: schema.productVariants.sellerSku,
      shopId: schema.products.shopId,
      shopName: schema.shops.name,
      stock: schema.productVariants.stockGlobal,
    })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .where(
      and(
        inArray(schema.products.shopId, shopIds),
        or(
          ilike(schema.products.name, needle),
          ilike(schema.products.brandName, needle),
          ilike(schema.productVariants.sellerSku, needle),
        ),
      ),
    )
    .limit(limit);

  return { shops: shopRows, products: productRows };
}
