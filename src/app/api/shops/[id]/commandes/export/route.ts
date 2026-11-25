import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listOrdersForShops } from "@/lib/orders";
import { parseDay } from "@/lib/order-access";

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

/**
 * GET /api/shops/:id/commandes/export — export CSV des commandes enregistrées.
 *
 * L'export respecte la **période** et le **statut** demandés : il exporte
 * exactement la sélection affichée à l'écran, et non toute la boutique.
 * Le droit `orders:read` sur la boutique est vérifié côté serveur.
 */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("orders:read")) {
    return fail(403, "Permission insuffisante pour exporter les commandes.");
  }

  const url = new URL(request.url);
  const from = parseDay(url.searchParams.get("from") ?? undefined);
  const to = parseDay(url.searchParams.get("to") ?? undefined, true);
  const status = url.searchParams.get("status") ?? undefined;

  const rows = await listOrdersForShops([id], { status, from, to, limit: 5000 });
  const csv = toCsv(
    COLUMNS,
    rows.map(({ order }) => ({
      orderNumber: order.orderNumber ?? "",
      externalOrderId: order.externalOrderId,
      status: order.status,
      createdAt: order.remoteCreatedAt ? new Date(order.remoteCreatedAt).toISOString() : "",
      totalLocal: order.totalAmountMinor,
      currency: order.currency,
      items: order.totalItems ?? 0,
      customerCity: order.customerCity ?? "",
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
    metadata: {
      module: "commandes",
      format: "csv",
      rows: rows.length,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      status: status ?? null,
    },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
