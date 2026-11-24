import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getDb, schema } from "@/db";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { JumiaError } from "@/lib/jumia/client";
import { listRemoteShops } from "@/lib/jumia/shops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/jumia/shops — boutiques Jumia du compte vendeur, avec leur
 * rattachement éventuel à une boutique locale.
 *
 * Réservé aux propriétaires : la liste est celle du compte (mastershop),
 * pas d'une boutique en particulier. Aucun identifiant n'est renvoyé.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const shops = await listUserShops(user.id);
  if (!shops.some((shop) => shop.role === "owner")) {
    return fail(403, "Seul un propriétaire peut consulter les boutiques Jumia.");
  }

  try {
    const remote = await listRemoteShops();

    // Rattachements existants (toutes boutiques de l'utilisateur).
    const linked = await getDb()
      .select({
        shopId: schema.shops.id,
        localName: schema.shops.name,
        remoteShopId: schema.shops.remoteShopId,
      })
      .from(schema.shops)
      .where(eq(schema.shops.ownerUserId, user.id));

    const byRemoteId = new Map(
      linked
        .filter((row) => row.remoteShopId !== null)
        .map((row) => [row.remoteShopId as string, { shopId: row.shopId, name: row.localName }]),
    );

    await audit({
      action: "admin.jumia_test",
      result: "success",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { count: remote.length },
    });

    return ok({
      shops: remote.map((shop) => ({
        id: shop.id,
        name: shop.name,
        countries: shop.countries,
        linkedTo: byRemoteId.get(shop.id) ?? null,
      })),
    });
  } catch (error) {
    const detail = error instanceof JumiaError ? error.message : "erreur inattendue";
    await audit({
      action: "admin.jumia_shops",
      result: "failure",
      userId: user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { error: detail.slice(0, 200) },
    });
    return fail(502, `Lecture des boutiques Jumia impossible : ${detail}`);
  }
}
