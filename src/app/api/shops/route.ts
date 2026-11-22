import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { createShop } from "@/lib/shops";
import { formatZodErrors, createShopSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/** GET /api/shops — boutiques de l'utilisateur connecté. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { listUserShops } = await import("@/lib/shops");
  const shops = await listUserShops(user.id);
  return ok(shops);
}

/** POST /api/shops — crée une boutique (devient owner). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = createShopSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));

  try {
    const shop = await createShop(user.id, parsed.data);
    await audit({
      action: "shop.created",
      result: "success",
      userId: user.id,
      entityType: "shop",
      entityId: shop.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(shop, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (message.includes("unique") || message.includes("shops_platform_external")) {
      return fail(409, "Cette boutique est déjà enregistrée pour cette plateforme.");
    }
    return fail(500, "Création impossible.", [message]);
  }
}
