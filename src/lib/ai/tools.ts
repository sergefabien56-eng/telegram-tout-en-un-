import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getShopAccess } from "@/lib/permissions";
import { reportSales, reportCatalog } from "@/lib/reports";
import { listPayoutStatements, sumStatements } from "@/lib/payments";
import { getCurrentShop } from "@/lib/current-shop";

/**
 * Outils MIMI — uniquement des agrégats réels, chacun filtré par les
 * permissions du rôle sur la boutique concernée. Aucun outil ne peut écrire
 * de prix ou de stock : ces modifications restent humaines.
 */

export const mimiToolNames = [
  "get_sales_kpis",
  "get_stock_alerts",
  "get_financial_summary",
  "compare_shops",
  "search_products",
] as const;

export type MimiToolName = (typeof mimiToolNames)[number];

type Ctx = {
  userId: string;
  shopId?: string | null;
};

/** Chaque outil déclare ses arguments (Zod) et vérifie ses permissions. */
export function mimiToolsFor(ctx: Ctx): {
  name: MimiToolName;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}[] {
  return [
    {
      name: "get_sales_kpis",
      description:
        "Chiffre d'affaires, nombre de commandes, unités vendues et panier moyen sur une période, pour UNE boutique. Les montants proviennent des commandes réellement enregistrées (livrées et expédiées).",
      parameters: {
        type: "object",
        properties: {
          shop_id: { type: "string", description: "Identifiant de la boutique." },
          days: {
            type: "integer",
            minimum: 1,
            maximum: 90,
            description: "Fenêtre en jours (défaut 30).",
          },
        },
        required: ["shop_id"],
      },
      run: async (args) => {
        const access = await assertAccess(ctx.userId, String(args.shop_id), "orders:read");
        const days = Math.min(Math.max(Number(args.days ?? 30), 1), 90);
        const to = new Date();
        const from = new Date(to.getTime() - (days - 1) * 86_400_000);
        from.setUTCHours(0, 0, 0, 0);
        const sales = await reportSales(
          access.shopId,
          { from, to },
          {
            statusFilter: ["DELIVERED", "SHIPPED"],
          },
        );
        return {
          shop: access.shop.name,
          period: `${sales.from} → ${sales.to}`,
          revenue_minor: sales.totals.revenueMinor,
          currency: access.shop.currency ?? "XOF",
          orders: sales.totals.orders,
          canceled_orders: sales.totals.canceledOrders,
          units: sales.totals.units,
          average_order_minor:
            sales.totals.orders === 0
              ? null
              : Math.round(sales.totals.revenueMinor / sales.totals.orders),
          days_with_sales: sales.series.filter((row) => row.revenueMinor > 0).length,
        };
      },
    },
    {
      name: "get_stock_alerts",
      description:
        "Produits dont le stock déclaré est faible (≤ 5) avec leur SKU vendeur et le stock total de la boutique. Source : stocks synchronisés.",
      parameters: {
        type: "object",
        properties: { shop_id: { type: "string" } },
        required: ["shop_id"],
      },
      run: async (args) => {
        const access = await assertAccess(ctx.userId, String(args.shop_id), "inventory:read");
        const catalog = await reportCatalog(access.shopId);
        return {
          shop: access.shop.name,
          variants: catalog.variants,
          stock_units: catalog.stockUnits,
          low_stock_count: catalog.lowStock,
          stock_value_minor: catalog.stockValueMinor,
          currency: access.shop.currency ?? "XOF",
          lowest: catalog.lowestStock.slice(0, 5),
        };
      },
    },
    {
      name: "get_financial_summary",
      description:
        "Relevés de versement Jumia enregistrés : CA articles, commissions, net à verser et montants déjà payés. Uniquement des champs publiés par Jumia.",
      parameters: {
        type: "object",
        properties: { shop_id: { type: "string" } },
        required: ["shop_id"],
      },
      run: async (args) => {
        const access = await assertAccess(ctx.userId, String(args.shop_id), "finance:read");
        const rows = await listPayoutStatements(access.shopId, 50);
        const totals = sumStatements(rows);
        return {
          shop: access.shop.name,
          statements: rows.length,
          revenue_minor: totals.revenue,
          fees_minor: totals.fees,
          shipment_fees_minor: totals.shipmentFees,
          refunds_minor: totals.refunds,
          net_minor: totals.net,
          paid_minor: totals.paid,
          unpaid: totals.unpaid,
          currency: access.shop.currency ?? "XOF",
        };
      },
    },
    {
      name: "compare_shops",
      description:
        "Compare le chiffre d'affaires et le nombre de commandes de toutes les boutiques accessibles à l'utilisateur, sur la même période. N'implique que les boutiques où l'utilisateur a la permission de lire les commandes.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", minimum: 1, maximum: 90 },
          shop_ids: {
            type: "array",
            items: { type: "string" },
            description: "Restreint la comparaison à ces boutiques (optionnel).",
          },
        },
        required: [],
      },
      run: async (args) => {
        const days = Math.min(Math.max(Number(args.days ?? 30), 1), 90);
        const wanted = Array.isArray(args.shop_ids) ? args.shop_ids.map(String) : null;
        const { shops } = await getCurrentShop(ctx.userId);

        const results: Record<string, unknown>[] = [];
        for (const shop of shops) {
          if (wanted && !wanted.includes(shop.id)) continue;
          const access = await getShopAccess(ctx.userId, shop.id);
          if (!access?.permissions.has("orders:read")) continue;
          const to = new Date();
          const from = new Date(to.getTime() - (days - 1) * 86_400_000);
          from.setUTCHours(0, 0, 0, 0);
          const sales = await reportSales(
            shop.id,
            { from, to },
            {
              statusFilter: ["DELIVERED", "SHIPPED"],
            },
          );
          results.push({
            shop: shop.name,
            revenue_minor: sales.totals.revenueMinor,
            orders: sales.totals.orders,
            currency: shop.currency ?? "XOF",
          });
        }
        return { shops: results, note: "Boutiques sans commandes lisibles exclues." };
      },
    },
    {
      name: "search_products",
      description:
        "Recherche un produit enregistré par nom, marque ou catégorie, avec son prix et son stock. Ne retourne que ce qui existe en base.",
      parameters: {
        type: "object",
        properties: {
          shop_id: { type: "string" },
          query: { type: "string", minLength: 2 },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["shop_id", "query"],
      },
      run: async (args) => {
        const access = await assertAccess(ctx.userId, String(args.shop_id), "products:read");
        const db = getDb();
        const needle = `%${String(args.query)}%`;
        const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 20);
        const rows = await db
          .select({
            name: schema.products.name,
            brand: schema.products.brandName,
            category: schema.products.categoryName,
            status: schema.products.status,
            sellerSku: schema.productVariants.sellerSku,
            priceMinor: schema.productVariants.priceMinor,
            stockGlobal: schema.productVariants.stockGlobal,
            currency: schema.productVariants.currency,
          })
          .from(schema.productVariants)
          .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
          .where(
            and(
              eq(schema.products.shopId, access.shopId),
              or(
                ilike(schema.products.name, needle),
                ilike(schema.products.brandName, needle),
                ilike(schema.products.categoryName, needle),
              ),
            ),
          )
          .limit(limit);

        return {
          shop: access.shop.name,
          count: rows.length,
          products: rows.map((row) => ({
            ...row,
            price_minor: row.priceMinor,
            stock: row.stockGlobal,
          })),
        };
      },
    },
  ];
}

type AccessWithShop = {
  shopId: string;
  permissions: Set<string>;
  shop: typeof schema.shops.$inferSelect;
};

async function assertAccess(
  userId: string,
  shopId: string,
  permission: string,
): Promise<AccessWithShop> {
  const access = await getShopAccess(userId, shopId);
  if (!access) throw new Error("Boutique introuvable ou accès refusé.");
  if (!access.permissions.has(permission)) {
    throw new Error(`Votre rôle sur cette boutique n'autorise pas ${permission}.`);
  }
  const [shop] = await getDb().select().from(schema.shops).where(eq(schema.shops.id, shopId));
  if (!shop) throw new Error("Boutique introuvable.");
  return { shopId, permissions: access.permissions, shop };
}

/** Argument d'outil validé (les appels du modèle passent par ce garde). */
const toolArgumentSchemas: Record<MimiToolName, z.ZodType<Record<string, unknown>>> = {
  get_sales_kpis: z.object({
    shop_id: z.string().min(1),
    days: z.number().int().min(1).max(90).optional(),
  }),
  get_stock_alerts: z.object({ shop_id: z.string().min(1) }),
  get_financial_summary: z.object({ shop_id: z.string().min(1) }),
  compare_shops: z
    .object({
      days: z.number().int().min(1).max(90).optional(),
      shop_ids: z.array(z.string()).max(10).optional(),
    })
    .passthrough(),
  search_products: z.object({
    shop_id: z.string().min(1),
    query: z.string().min(2),
    limit: z.number().int().min(1).max(20).optional(),
  }),
};

/** Les arguments venant du modèle sont validés avant tout appel d'outil. */
export function parseToolArguments(toolName: MimiToolName, raw: unknown): Record<string, unknown> {
  const schema = toolArgumentSchemas[toolName];
  return schema.parse(raw ?? {}) as Record<string, unknown>;
}
