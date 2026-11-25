import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopFully } from "@/lib/full-sync";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/sync — synchronisation complète d'une boutique
 * rattachée : catalogue + stocks, commandes (90 j) et relevés de versement.
 *
 * Permission `shops:write` (propriétaire ou manager). L'opération est
 * idempotente : relancer la synchronisation met à jour au lieu de dupliquer.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("shops:write")) return fail(403, "Permission insuffisante.");

  let days: number | undefined;
  try {
    const body = (await request.json()) as { days?: unknown };
    if (typeof body?.days === "number" && Number.isFinite(body.days)) days = body.days;
  } catch {
    // corps vide : 90 jours par défaut (limite de l'API Jumia)
  }

  const result = await syncShopFully({ userId: user.id, shopId: id, days });

  if (!result.ok) {
    await audit({
      action: "shop.full_synced",
      result: "failure",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: result,
    });
  }

  // 200 même en cas d'échec partiel : le detail dit ce qui a réussi ou non.
  return ok(result);
}
