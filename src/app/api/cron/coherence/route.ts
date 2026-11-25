import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { checkShopCoherence } from "@/lib/coherence";
import { recordCoherenceSnapshot } from "@/lib/coherence-history";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/coherence — contrôle de cohérence planifié (0 FCFA).
 *
 * Ce point d'entrée est appelé une fois par jour par une **tâche cron
 * GitHub Actions** (gratuite) : il refait le contrôle de cohérence de chaque
 * boutique rattachée à un compte vendeur et **enregistre l'instantané du
 * jour**. C'est ce qui rend l'historique utile : une dérive se voit dans le
 * temps, pas seulement à l'instant où quelqu'un ouvre le diagnostic.
 *
 * Protection : `Authorization: Bearer <CRON_SECRET>` (comparaison stricte).
 * Aucun secret n'est accepté par query string ni par cookie.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(500, "CRON_SECRET n'est pas configuré.");

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) return fail(401, "Non autorisé.");

  const db = getDb();

  // Boutiques rattachées à un compte vendeur : ce sont les seules dont on
  // peut prouver la cohérence avec la source.
  const shops = await db
    .select({ id: schema.shops.id, name: schema.shops.name })
    .from(schema.shops)
    .where(isNotNull(schema.shops.jumiaAccountId));

  const results: { shop: string; status: string; anomalies: number }[] = [];

  for (const shop of shops) {
    try {
      const check = await checkShopCoherence({ shopId: shop.id });
      if (check.status !== "indisponible") {
        await recordCoherenceSnapshot(shop.id, check);
      }
      results.push({
        shop: shop.name,
        status: check.status,
        anomalies: check.anomalies.length,
      });
    } catch (error) {
      results.push({
        shop: shop.name,
        status: "indisponible",
        anomalies: 0,
      });
      console.error("[cron] contrôle de cohérence impossible", shop.id, error);
    }
  }

  await audit({
    action: "admin.coherence_cron",
    result: "success",
    entityType: "shop",
    metadata: { shops: results.length, results },
  });

  return ok({ checked: results.length, results, at: new Date().toISOString() });
}

/** GET — simple vérification de disponibilité (sans effet de bord). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(500, "CRON_SECRET n'est pas configuré.");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) return fail(401, "Non autorisé.");

  const db = getDb();
  const shops = await db
    .select({ id: schema.shops.id })
    .from(schema.shops)
    .where(isNotNull(schema.shops.jumiaAccountId));
  return ok({ shops: shops.length, protected: true });
}
