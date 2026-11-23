import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { cookies } from "next/headers";

const SHOP_COOKIE = "teu_shop";

/**
 * POST /api/shops/select — enregistre la boutique courante dans un cookie.
 * L'accès à la boutique est vérifié : impossible de sélectionner une boutique
 * à laquelle l'utilisateur n'appartient pas.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: { shopId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const shopId = typeof body.shopId === "string" ? body.shopId : "";
  if (!shopId) return fail(422, "shopId manquant.");

  const access = await getShopAccess(user.id, shopId);
  if (!access) return fail(403, "Boutique inaccessible.");

  const store = await cookies();
  store.set(SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  await audit({
    action: "shop.selected",
    result: "success",
    userId: user.id,
    entityType: "shop",
    entityId: shopId,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
  });

  return ok({ shopId });
}
