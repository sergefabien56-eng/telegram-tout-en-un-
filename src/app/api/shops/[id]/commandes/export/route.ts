import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listOrders } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

const COLUMNS: CsvColumn[] = [
  { key: "orderNumber", label: "Commande" },
  { key: "externalOrderId", label: "Identifiant Jumia" },
  { key: "status", label: "Statut" },
  { key: "createdAt", label: "Créée le (UTC)" },
  { key: "totalLocal", label: "Montant (unités mineures)" },
  { key: "currency", label: "Devise" },
  { key: "items", label: "Articles" },
  { key: "customerCity", label: "Ville" },
];

/** GET /api/shops/:id/commandes/export — export CSV des commandes enregistrées. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("orders:read")) {
    return fail(403, "Permission insuffisante pour exporter les commandes.");
  }

  const rows = await listOrders(id, 500);
  const csv = toCsv(
    COLUMNS,
    rows.map((row) => ({
      orderNumber: row.orderNumber ?? "",
      externalOrderId: row.externalOrderId,
      status: row.status,
      createdAt: row.remoteCreatedAt ? new Date(row.remoteCreatedAt).toISOString() : "",
      totalLocal: row.totalAmountMinor,
      currency: row.currency,
      items: row.totalItems ?? 0,
      customerCity: row.customerCity ?? "",
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
    metadata: { module: "commandes", format: "csv", rows: rows.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
