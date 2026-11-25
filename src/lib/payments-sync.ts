import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
const db = getDb();
import { shops } from "@/db/schema";
import { audit } from "@/lib/audit";
import { fetchPayoutStatements } from "@/lib/jumia/payments";
import { upsertPayoutStatements } from "@/lib/payments";
import { resolveDefaultAccount } from "@/lib/jumia/accounts";
import { belongsToShop, statementShopSid } from "@/lib/shop-guard";

export async function syncShopPayments(input: {
  userId: string;
  shopId: string;
  createdAfter?: string;
}) {
  const [shop] = await db.select().from(shops).where(eq(shops.id, input.shopId));
  if (!shop) throw new Error("Boutique introuvable.");
  if (shop.ownerUserId !== input.userId) {
    throw new Error("Seul le propriétaire de la boutique peut synchroniser ses paiements.");
  }

  // Verrou partagé avec les autres synchronisations de la boutique.
  const [locked] = await db
    .update(shops)
    .set({ syncInProgress: true })
    .where(and(eq(shops.id, shop.id), eq(shops.syncInProgress, false)))
    .returning({ id: shops.id });
  if (!locked) throw new Error("Une synchronisation est déjà en cours pour cette boutique.");

  try {
    const accountId = await resolveDefaultAccount(input.userId, input.shopId);
    const { statements } = await fetchPayoutStatements({
      accountId: accountId ?? undefined,
      createdAfter: input.createdAfter,
      currency: "LOCAL",
      size: 100,
      page: 1,
    });

    // Garde-fou : un relevé portant le `shopSid` d'une autre boutique n'est
    // jamais enregistré sous celle-ci.
    const foreign = statements.filter(
      (statement) =>
        !belongsToShop(
          statementShopSid(statement as Record<string, unknown>),
          shop.remoteShopId,
        ),
    );
    const kept = statements.filter((statement) =>
      belongsToShop(
        statementShopSid(statement as Record<string, unknown>),
        shop.remoteShopId,
      ),
    );
    if (foreign.length > 0) {
      await audit({
        userId: input.userId,
        entityType: "shop",
        entityId: shop.id,
        action: "shop.payments_synced",
        result: "blocked",
        metadata: { reason: "autre_boutique", ecartees: foreign.length },
      });
    }

    const result = await upsertPayoutStatements(shop.id, kept as Record<string, unknown>[]);

    await db.insert(schema.jobs).values({
      type: "payments",
      shopId: shop.id,
      status: "done",
      payload: {
        fetched: kept.length,
        inserted: result.inserted,
        updated: result.updated,
        skipped: foreign.length,
      },
    });

    await audit({
      userId: input.userId,
      entityType: "shop",
      entityId: shop.id,
      action: "shop.payments_synced",
      result: "success",
      metadata: { ...result, fetched: kept.length, skipped: foreign.length },
    });

    return { ok: true, ...result, fetched: kept.length, skipped: foreign.length };
  } finally {
    await db.update(shops).set({ syncInProgress: false }).where(eq(shops.id, shop.id));
  }
}
