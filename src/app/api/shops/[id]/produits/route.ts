import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listProducts } from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/produits — catalogue enregistré pour la boutique. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("products:read")) return fail(403, "Permission insuffisante.");

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
  const products = await listProducts(id, Number.isFinite(limit) ? limit : 100);
  return ok({ products });
}
