import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listPayoutStatements } from "@/lib/payments";

type Params = { params: Promise<{ id: string }> };

const COLUMNS: CsvColumn[] = [
  { key: "statementNumber", label: "Relevé" },
  { key: "createdAt", label: "Créé le (UTC)" },
  { key: "revenue", label: "CA articles (unités mineures)" },
  { key: "shipmentFees", label: "Livraison (unités mineures)" },
  { key: "fees", label: "Commissions (unités mineures)" },
  { key: "refunds", label: "Remboursements (unités mineures)" },
  { key: "net", label: "Net (unités mineures)" },
  { key: "payout", label: "Versé (unités mineures)" },
  { key: "currency", label: "Devise" },
  { key: "paid", label: "Payé" },
  { key: "reference", label: "Référence de paiement" },
];

/** GET /api/shops/:id/finances/export — export CSV des relevés Jumia. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("finance:read")) {
    return fail(403, "Permission insuffisante pour exporter les finances.");
  }

  const rows = await listPayoutStatements(id, 200);
  const csv = toCsv(
    COLUMNS,
    rows.map((row) => ({
      statementNumber: row.statementNumber,
      createdAt: new Date(row.remoteCreatedAt).toISOString(),
      revenue: row.itemRevenueMinor,
      shipmentFees: row.shipmentFeeMinor,
      fees: row.feesTotalMinor,
      refunds: row.refundsMinor,
      net: row.closingBalanceMinor,
      payout: row.payoutAmountMinor ?? "",
      currency: row.currency,
      paid: row.paid ? "oui" : "non",
      reference: row.paymentReference ?? "",
    })),
  );

  await audit({
    userId: user.id,
    entityType: "shop",
    entityId: id,
    action: "shop.data_exported",
    result: "success",
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { module: "finances", format: "csv", rows: rows.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finances-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
