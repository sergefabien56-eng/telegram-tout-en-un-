import { audit } from "@/lib/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { fail, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listVariants } from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

const COLUMNS: CsvColumn[] = [
  { key: "name", label: "Produit" },
  { key: "brand", label: "Marque" },
  { key: "category", label: "Catégorie" },
  { key: "status", label: "Statut" },
  { key: "sellerSku", label: "SKU vendeur" },
  { key: "variation", label: "Déclinaison" },
  { key: "price", label: "Prix (unités mineures)" },
  { key: "salePrice", label: "Prix promo (unités mineures)" },
  { key: "currency", label: "Devise" },
  { key: "stock", label: "Stock" },
];

/** GET /api/shops/:id/produits/export — export CSV du catalogue enregistré. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("products:read")) {
    return fail(403, "Permission insuffisante pour exporter le catalogue.");
  }

  const rows = await listVariants(id, 500);
  const csv = toCsv(
    COLUMNS,
    rows.map(({ variant, productName }) => ({
      name: productName,
      brand: "",
      category: "",
      status: variant.status ?? "",
      sellerSku: variant.sellerSku ?? "",
      variation: variant.variationName ?? "",
      price: variant.priceMinor ?? "",
      salePrice: variant.salePriceMinor ?? "",
      currency: variant.currency,
      stock: variant.stockGlobal ?? "",
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
    metadata: { module: "catalogue", format: "csv", rows: rows.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="catalogue-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
