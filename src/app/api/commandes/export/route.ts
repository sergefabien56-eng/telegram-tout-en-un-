import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { listOrdersForShops } from "@/lib/orders";
import { orderScope, parseDay } from "@/lib/order-access";
import { getSessionUser } from "@/lib/session";

const COLUMNS: CsvColumn[] = [
  { key: "shop", label: "Boutique" },
  { key: "orderNumber", label: "Commande" },
  { key: "externalOrderId", label: "Identifiant Jumia" },
  { key: "status", label: "Statut" },
  { key: "createdAt", label: "Créée le (UTC)" },
  { key: "totalLocal", label: "Montant (unités mineures)" },
  { key: "currency", label: "Devise" },
  { key: "items", label: "Articles" },
  { key: "customer", label: "Client" },
  { key: "city", label: "Ville" },
];

/**
 * GET /api/commandes/export — export CSV d'un périmètre choisi (boutiques
 * autorisées, dates, statut). Toute boutique non autorisée est écartée.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const scope = await orderScope(user.id);
  const url = new URL(request.url);
  const requested = (url.searchParams.get("shopIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedIds = scope.allowed.map((shop) => shop.id);
  const shopIds =
    requested.length > 0 ? requested.filter((id) => allowedIds.includes(id)) : allowedIds;

  if (scope.total === 0) return fail(409, "Aucune boutique accessible.");
  if (shopIds.length === 0) return fail(403, "Aucune boutique autorisée dans ce périmètre.");

  const from = parseDay(url.searchParams.get("from") ?? undefined);
  const to = parseDay(url.searchParams.get("to") ?? undefined, true);
  const status = url.searchParams.get("status") ?? undefined;
  const rows = await listOrdersForShops(shopIds, { status, from, to, limit: 5000 });

  const csv = toCsv(
    COLUMNS,
    rows.map(({ order, shopName }) => ({
      shop: shopName,
      orderNumber: order.orderNumber ?? "",
      externalOrderId: order.externalOrderId,
      status: order.status,
      createdAt: order.remoteCreatedAt ? new Date(order.remoteCreatedAt).toISOString() : "",
      totalLocal: order.totalAmountMinor,
      currency: order.currency,
      items: order.totalItems ?? 0,
      customer: [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || "",
      city: order.customerCity ?? "",
    })),
  );

  await audit({
    userId: user.id,
    entityType: "shop",
    entityId: shopIds[0],
    action: "shop.data_exported",
    result: "success",
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { module: "commandes", format: "csv", shops: shopIds.length, rows: rows.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-export.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
