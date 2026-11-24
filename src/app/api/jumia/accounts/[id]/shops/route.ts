import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { attachRemoteShop, isOwnedBy } from "@/lib/jumia/accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/jumia/accounts/:id/shops — crée la boutique locale et la
 * rattache à une boutique Jumia du compte, sans identifiant technique.
 *
 * Vérifications : le compte appartient à l'utilisateur, la boutique distante
 * existe sur ce compte, elle n'est pas déjà rattachée.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  if (!(await isOwnedBy(user.id, id))) return fail(403, "Ce compte Jumia ne vous appartient pas.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }
  const remoteShopId =
    typeof (body as { remoteShopId?: unknown })?.remoteShopId === "string"
      ? (body as { remoteShopId: string }).remoteShopId.trim()
      : "";
  if (!remoteShopId) return fail(422, "Identifiant de boutique Jumia manquant.");

  const result = await attachRemoteShop(user.id, id, remoteShopId);

  if (!result.ok) {
    const status =
      result.code === "already_linked" ? 409 : result.code === "no_currency" ? 422 : 404;
    await audit({
      action: "shop.jumia_linked",
      result: "blocked",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.code, accountId: id, remoteShopId },
    });
    return fail(status, result.error);
  }

  await audit({
    action: "shop.created",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: result.shop.id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { name: result.shop.name, source: "jumia_account" },
  });
  await audit({
    action: "shop.jumia_linked",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: result.shop.id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { accountId: id, remoteShopId },
  });

  return ok(result.shop, { status: 201 });
}
