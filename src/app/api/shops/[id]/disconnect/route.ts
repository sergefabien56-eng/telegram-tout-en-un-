import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { updateShop } from "@/lib/shops";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** POST /api/shops/:id/disconnect — déconnecte la boutique (shops:write). */
export async function POST(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("shops:write")) return fail(403, "Permission insuffisante.");

  const shop = await updateShop(user.id, id, { status: "disconnected" });
  if (!shop) return fail(404, "Boutique introuvable.");

  await audit({
    action: "shop.disconnected",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: id,
  });
  return ok(shop);
}
