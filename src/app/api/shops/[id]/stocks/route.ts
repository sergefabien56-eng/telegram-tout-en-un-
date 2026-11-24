import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { listVariants } from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id/stocks — déclinaisons et leurs stocks enregistrés. */
export async function GET(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("inventory:read")) return fail(403, "Permission insuffisante.");

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "200");
  const variants = await listVariants(id, Number.isFinite(limit) ? limit : 200);
  return ok({ variants });
}
