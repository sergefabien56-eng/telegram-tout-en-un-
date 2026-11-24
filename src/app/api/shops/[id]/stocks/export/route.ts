import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listVariants } from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

const COLUMNS: CsvColumn[] = [
  { key: "name", label: "Produit" },
  { key: "sellerSku", label: "SKU vendeur" },
  { key: "variation", label: "Déclinaison" },
  { key: "stock", label: "Stock" },
  { key: "updatedAt", label: "Dernière mise à jour (UTC)" },
];

/** GET /api/shops/:id/stocks/export — export CSV des stocks enregistrés. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("inventory:read")) {
    return fail(403, "Permission insuffisante pour exporter les stocks.");
  }

  const rows = await listVariants(id, 500);
  const csv = toCsv(
    COLUMNS,
    rows.map(({ variant, productName }) => ({
      name: productName,
      sellerSku: variant.sellerSku ?? "",
      variation: variant.variationName ?? "",
      stock: variant.stockGlobal ?? "",
      updatedAt: variant.stockUpdatedAt ? new Date(variant.stockUpdatedAt).toISOString() : "",
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
    metadata: { module: "stocks", format: "csv", rows: rows.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stocks-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
