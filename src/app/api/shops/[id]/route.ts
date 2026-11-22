import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopDetail, updateShop } from "@/lib/shops";
import { formatZodErrors, updateShopSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** GET /api/shops/:id — détail (rôle de l'appelant inclus). */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const shop = await getShopDetail(user.id, id);
  if (!shop) return fail(404, "Boutique introuvable ou accès refusé.");
  return ok(shop);
}

/** PATCH /api/shops/:id — mise à jour (permission shops:write). */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = updateShopSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));

  try {
    const shop = await updateShop(user.id, id, parsed.data);
    if (!shop) return fail(404, "Boutique introuvable ou accès refusé.");
    await audit({
      action: "shop.updated",
      result: "success",
      userId: user.id,
      entityType: "shop",
      entityId: shop.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(shop);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (message.includes("Permission")) return fail(403, message);
    return fail(500, "Mise à jour impossible.", [message]);
  }
}
