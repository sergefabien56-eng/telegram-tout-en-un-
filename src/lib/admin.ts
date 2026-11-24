import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listUserShops } from "@/lib/shops";

/**
 * Vue d'administration — agrégats réels, **limités aux boutiques que
 * l'utilisateur peut voir**. Aucun compteur estimé, aucune donnée de démo.
 */

export type AdminOverview = {
  shops: {
    total: number;
    connected: number;
    rows: { id: string; name: string; status: string | null; remoteShopName: string | null }[];
  };
  members: { role: string; count: number }[];
  jobs: {
    pending: number;
    running: number;
    done: number;
    failed: number;
    last: { id: string; type: string; status: string; createdAt: Date }[];
  };
  ai: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    providers: { provider: string; calls: number }[];
  };
  audit: { action: string; result: string; createdAt: Date }[];
};

/** L'accès administration est accordé aux rôles portant `admin:read`. */
export async function hasAdminAccess(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ role: schema.shopMembers.role })
    .from(schema.shopMembers)
    .where(eq(schema.shopMembers.userId, userId));

  return rows.some((row) => row.role === "owner" || row.role === "manager");
}

export async function adminOverview(userId: string): Promise<AdminOverview> {
  const db = getDb();
  const accessible = await listUserShops(userId);
  const shopIds = accessible.map((shop) => shop.id);

  // Aucune boutique accessible : vue vide, mais honnête.
  if (shopIds.length === 0) {
    return {
      shops: { total: 0, connected: 0, rows: [] },
      members: [],
      jobs: { pending: 0, running: 0, done: 0, failed: 0, last: [] },
      ai: { calls: 0, promptTokens: 0, completionTokens: 0, providers: [] },
      audit: [],
    };
  }

  const shopRows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      status: schema.shops.status,
      remoteShopName: schema.shops.remoteShopName,
    })
    .from(schema.shops)
    .where(inArray(schema.shops.id, shopIds))
    .orderBy(desc(schema.shops.createdAt));

  const memberRoles = await db
    .select({ role: schema.shopMembers.role, count: dbCount() })
    .from(schema.shopMembers)
    .where(inArray(schema.shopMembers.shopId, shopIds))
    .groupBy(schema.shopMembers.role);

  const jobCounts = await db
    .select({ status: schema.jobs.status, count: dbCount() })
    .from(schema.jobs)
    .where(inArray(schema.jobs.shopId, shopIds))
    .groupBy(schema.jobs.status);

  const lastJobs = await db
    .select({
      id: schema.jobs.id,
      type: schema.jobs.type,
      status: schema.jobs.status,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(inArray(schema.jobs.shopId, shopIds))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(5);

  // Consommation IA des utilisateurs rattachés à ces boutiques.
  const memberUsers = await db
    .select({ userId: schema.shopMembers.userId })
    .from(schema.shopMembers)
    .where(inArray(schema.shopMembers.shopId, shopIds));
  const userIds = [...new Set(memberUsers.map((row) => row.userId))];

  const usage =
    userIds.length > 0
      ? await db
          .select({
            calls: dbCount(),
            promptTokens: sql<number>`coalesce(sum(${schema.aiUsage.promptTokens}), 0)::int`,
            completionTokens: sql<number>`coalesce(sum(${schema.aiUsage.completionTokens}), 0)::int`,
          })
          .from(schema.aiUsage)
          .where(inArray(schema.aiUsage.userId, userIds))
      : [];

  const providers =
    userIds.length > 0
      ? await db
          .select({ provider: schema.aiUsage.provider, calls: dbCount() })
          .from(schema.aiUsage)
          .where(inArray(schema.aiUsage.userId, userIds))
          .groupBy(schema.aiUsage.provider)
      : [];

  const auditRows = await db
    .select({
      action: schema.auditLogs.action,
      result: schema.auditLogs.result,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    // Le journal porte surtout `entity_id`, pas toujours `shop_id` : on retient
    // les entrées de ces boutiques et celles des utilisateurs rattachés.
    .where(
      or(
        inArray(schema.auditLogs.shopId, shopIds),
        userIds.length > 0 ? inArray(schema.auditLogs.userId, userIds) : undefined,
      ),
    )
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(8);

  const byStatus = new Map(jobCounts.map((row) => [row.status, Number(row.count)]));
  const usageRow = usage[0] ?? { calls: 0, promptTokens: 0, completionTokens: 0 };

  return {
    shops: {
      total: shopRows.length,
      connected: shopRows.filter((row) => row.remoteShopName !== null).length,
      rows: shopRows,
    },
    members: memberRoles.map((row) => ({ role: row.role, count: Number(row.count) })),
    jobs: {
      pending: byStatus.get("queued") ?? 0,
      running: byStatus.get("running") ?? 0,
      done: byStatus.get("done") ?? 0,
      failed: byStatus.get("failed") ?? 0,
      last: lastJobs,
    },
    ai: {
      calls: Number(usageRow.calls),
      promptTokens: Number(usageRow.promptTokens),
      completionTokens: Number(usageRow.completionTokens),
      providers: providers.map((row) => ({ provider: row.provider, calls: Number(row.calls) })),
    },
    audit: auditRows,
  };
}

/** Comptage entier en SQL (les agrégats ne passent jamais par un calcul JS). */
function dbCount() {
  return sql<number>`count(*)::int`;
}
