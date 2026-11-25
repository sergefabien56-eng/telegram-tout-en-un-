import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
const db = getDb();
import { payoutStatements } from "@/db/schema";
import { toMinorUnits } from "@/lib/orders";

type StatementRow = typeof payoutStatements.$inferSelect;

function normalizeStatement(input: {
  shopId: string;
  raw: Record<string, unknown>;
}): Omit<StatementRow, "id" | "syncedAt"> | null {
  const statementNumber = String(input.raw.statementNumber ?? "").trim();
  if (!statementNumber) return null;

  const payout = (input.raw.payout ?? {}) as { amount?: unknown; currency?: unknown };
  const payoutAmount = typeof payout.amount === "number" ? payout.amount : undefined;
  const currency =
    typeof payout.currency === "string" && payout.currency.trim()
      ? payout.currency.trim().toUpperCase()
      : "XOF";

  // Jumia envoie des nombres à virgule en devise locale : conversion entière.
  const minor = (value: unknown) =>
    typeof value === "number" ? toMinorUnits(value, currency) : null;
  const opening = minor(input.raw.openingBalance);
  const revenue = minor(input.raw.itemRevenue);
  const fees = minor(input.raw.feesTotal);
  const closing = minor(input.raw.closingBalance);

  if (opening === null || revenue === null || fees === null || closing === null) return null;

  const remoteShopSid =
    typeof input.raw.shopSid === "string" && input.raw.shopSid.trim()
      ? input.raw.shopSid.trim()
      : null;

  return {
    shopId: input.shopId,
    statementNumber,
    remoteShopSid,
    currency,
    openingBalanceMinor: opening,
    itemRevenueMinor: revenue,
    shipmentFeeMinor: minor(input.raw.shipmentFee) ?? 0,
    feesTotalMinor: fees,
    otherRevenueMinor: minor(input.raw.otherRevenueTotal) ?? 0,
    refundsMinor: minor(input.raw.refunds) ?? 0,
    closingBalanceMinor: closing,
    payoutAmountMinor: payoutAmount !== undefined ? minor(payoutAmount) : null,
    paid: Boolean(input.raw.paid),
    paymentReference: input.raw.paymentReference ? String(input.raw.paymentReference) : null,
    remoteCreatedAt: new Date(String(input.raw.createdAt).replace(" ", "T") + "Z"),
    remoteUpdatedAt: input.raw.updatedAt
      ? new Date(String(input.raw.updatedAt).replace(" ", "T") + "Z")
      : null,
  };
}

/**
 * Enregistre les relevés ; un relevé déjà connu est mis à jour (jamais recréé).
 * L'existence préalable est vérifiée pour distinguer inséré / mis à jour.
 */
export async function upsertPayoutStatements(
  shopId: string,
  raws: Record<string, unknown>[],
): Promise<{ inserted: number; updated: number; total: number }> {
  let inserted = 0;
  let updated = 0;

  for (const raw of raws) {
    const values = normalizeStatement({ shopId, raw });
    if (!values) continue;

    const [known] = await db
      .select({ id: payoutStatements.id })
      .from(schema.payoutStatements)
      .where(
        and(
          eq(schema.payoutStatements.shopId, shopId),
          eq(schema.payoutStatements.statementNumber, values.statementNumber),
        ),
      );

    if (known) {
      await db
        .update(payoutStatements)
        .set({
          currency: values.currency,
          remoteShopSid: values.remoteShopSid,
          openingBalanceMinor: values.openingBalanceMinor,
          itemRevenueMinor: values.itemRevenueMinor,
          shipmentFeeMinor: values.shipmentFeeMinor,
          feesTotalMinor: values.feesTotalMinor,
          otherRevenueMinor: values.otherRevenueMinor,
          refundsMinor: values.refundsMinor,
          closingBalanceMinor: values.closingBalanceMinor,
          payoutAmountMinor: values.payoutAmountMinor,
          paid: values.paid,
          paymentReference: values.paymentReference,
          remoteUpdatedAt: values.remoteUpdatedAt,
          syncedAt: new Date(),
        })
        .where(eq(schema.payoutStatements.id, known.id));
      updated += 1;
      continue;
    }

    await db.insert(payoutStatements).values(values);
    inserted += 1;
  }

  return { inserted, updated, total: raws.length };
}

export async function listPayoutStatements(shopId: string, limit = 50) {
  return db
    .select()
    .from(schema.payoutStatements)
    .where(eq(schema.payoutStatements.shopId, shopId))
    .orderBy(desc(payoutStatements.remoteCreatedAt))
    .limit(limit);
}

/** Totaux de la boutique sur la fenêtre demandée (tous les relevés renvoyés). */
export function sumStatements(rows: StatementRow[]) {
  const add = (pick: (row: StatementRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  return {
    revenue: add((row) => row.itemRevenueMinor),
    shipmentFees: add((row) => row.shipmentFeeMinor),
    fees: add((row) => row.feesTotalMinor),
    refunds: add((row) => row.refundsMinor),
    net: add((row) => row.closingBalanceMinor),
    paid: add((row) => row.payoutAmountMinor ?? 0),
    unpaid: rows.some((row) => !row.paid),
  };
}
