import { audit } from "@/lib/audit";
import { setPurchasePrice } from "@/lib/catalog";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getShopAccess } from "@/lib/permissions";
import { listUserShops } from "@/lib/shops";
import { toMinorUnits } from "@/lib/orders";
import { purchasePriceSchema } from "@/lib/purchase-price";
import { getSessionUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/prix-achat — saisie manuelle du prix d'achat d'un SKU.
 * Aucune donnée n'est reprise de Jumia : c'est vous qui renseignez le montant.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("products:write")) {
    return fail(403, "Permission insuffisante pour modifier les prix d'achat.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }
  const parsed = purchasePriceSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Prix d'achat invalide.");

  // La devise de la boutique sert à convertir en unités mineures entières.
  const shops = await listUserShops(user.id);
  const shop = shops.find((row) => row.id === id);
  const currency = shop?.currency ?? "XOF";
  const minor = parsed.data.price === null ? null : toMinorUnits(parsed.data.price, currency);

  if (minor === null && parsed.data.price !== null) {
    return fail(422, "Montant trop précis ou invalide pour cette devise.");
  }

  const updated = await setPurchasePrice(id, parsed.data.sku, minor);

  await audit({
    userId: user.id,
    entityType: "shop",
    entityId: id,
    action: "product.purchase_price_updated",
    result: "success",
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { sku: parsed.data.sku, purchasePriceMinor: minor },
  });

  if (!updated) return fail(404, "Aucune déclinaison ne correspond à ce SKU dans cette boutique.");
  return ok({ purchasePriceMinor: minor });
}
