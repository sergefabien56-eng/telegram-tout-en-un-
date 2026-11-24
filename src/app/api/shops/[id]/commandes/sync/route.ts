import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopOrders } from "@/lib/orders-sync";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/commandes/sync — synchronise les commandes Jumia.
 *
 * Permission `orders:write` (owner, manager). La plage est volontairement
 * limitée à 90 jours par l'API Jumia ; 5 pages de 200 commandes maximum par
 * appel pour préserver le quota.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("orders:write")) return fail(403, "Permission insuffisante.");

  let days: number | undefined;
  try {
    const body = (await request.json()) as { days?: unknown };
    if (typeof body?.days === "number" && Number.isFinite(body.days)) days = body.days;
  } catch {
    // corps vide : on garde la valeur par défaut (30 jours)
  }

  const result = await syncShopOrders({
    userId: user.id,
    shopId: id,
    days,
    requestMeta: { ip: requestIp(request), userAgent: requestUserAgent(request) },
  });

  if (!result.ok) {
    const running = result.reason?.includes("déjà en cours");
    await audit({
      action: "shop.orders_synced",
      result: "blocked",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.reason ?? "inconnue" },
    });
    // 409 = un autre appel est déjà en train ou la boutique n'est pas prête.
    const status = running || result.reason?.includes("rattachée") ? 409 : 502;
    return fail(status, result.reason ?? "Synchronisation impossible.");
  }

  return ok(result);
}
