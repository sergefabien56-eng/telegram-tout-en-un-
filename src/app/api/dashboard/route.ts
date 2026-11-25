import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getCurrentShop } from "@/lib/current-shop";
import { dashboardOverview } from "@/lib/dashboard";
import { ALL_SHOPS } from "@/lib/order-access";

/**
 * GET /api/dashboard?days=30&boutique=<id|toutes>
 *
 * Le périmètre suit exactement la règle des autres écrans :
 * - `boutique=<id>` autorisé → cette boutique seule ;
 * - `boutique=<id>` non autorisé → périmètre **vide** (jamais d'élargissement) ;
 * - `boutique=toutes` → agrégat explicite ;
 * - sans paramètre → la boutique courante (cookie), pas l'agrégat surprise.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const params = new URL(request.url).searchParams;
  const daysRaw = Number(params.get("days") ?? "30");
  const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 90 ? daysRaw : 30;

  const { shop, shops } = await getCurrentShop(user.id);
  if (shops.length === 0) return fail(409, "Aucune boutique accessible.");

  const all = shops.map((row) => row.id);
  const current = shop?.id ?? null;
  const requested = params.get("boutique");

  const shopIds = !requested
    ? current
      ? [current]
      : all
    : requested === ALL_SHOPS
      ? all
      : all.includes(requested)
        ? [requested]
        : [];

  return ok({
    overview: await dashboardOverview(user.id, days, shopIds),
  });
}
