import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { refreshPublication } from "@/lib/product-publications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; publicationId: string }> };

/**
 * GET /api/shops/:id/produits/publications/:publicationId
 *
 * Relit l'état réel de la demande chez Jumia : état du flux (`GET /feeds/{id}`)
 * puis présence du produit au catalogue (`GET /catalog/products`). C'est la
 * seule façon d'affirmer qu'un produit est **publié**.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id, publicationId } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:read")) {
    return fail(403, "Permission insuffisante (products:read).");
  }

  try {
    const result = await refreshPublication(id, publicationId, { shopId: id });
    return ok(result);
  } catch (error) {
    return fail(404, error instanceof Error ? error.message : "Publication introuvable.");
  }
}
