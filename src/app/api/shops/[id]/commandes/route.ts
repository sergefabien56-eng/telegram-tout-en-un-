import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listOrders } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/commandes — commandes enregistrées pour la boutique. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("orders:read")) return fail(403, "Permission insuffisante.");

  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? "100");
  const orders = await listOrders(id, Number.isFinite(limitParam) ? limitParam : 100);
  return ok({ orders });
}
