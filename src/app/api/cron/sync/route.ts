import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { autoSyncAllShops, listStaleAttachedShops } from "@/lib/auto-sync";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/sync — relecture automatique des boutiques rattachées.
 *
 * L'API Vendor Center de Jumia n'expose **aucun webhook** : la seule façon
 * de savoir qu'une commande est arrivée est de relire l'API. Cette route
 * est le point d'entrée de la relecture planifiée, appelée périodiquement
 * par une tâche cron GitHub Actions (gratuite).
 *
 * **Pourquoi c'est nécessaire en plus du rafraîchissement à l'écran.** Le
 * rafraîchissement automatique ne se produit que lorsque le vendeur consulte
 * l'application. Si l'hébergeur endort le service (offre gratuite), personne
 * ne voit rien pendant ce temps : la tâche planifiée garantit que les
 * données sont à jour **quand le vendeur arrive**, même après une longue
 * période d'inactivité.
 *
 * Protection : `Authorization: Bearer <CRON_SECRET>` (comparaison stricte).
 * Aucun secret n'est accepté par query string ni par cookie.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(500, "CRON_SECRET n'est pas configuré.");

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) return fail(401, "Non autorisé.");

  const shops = await listStaleAttachedShops();

  const results: { shop: string; started: boolean; reason?: string }[] = [];

  for (const shop of shops) {
    const result = await autoSyncAllShops({
      ownerUserId: shop.ownerUserId,
      shopId: shop.id,
    });
    results.push({
      shop: shop.name,
      started: result.started,
      reason: result.reason,
    });
  }

  // Les boutiques déjà à jour ne sont pas listées : elles n'ont rien demandé.
  const inspection = await getDb()
    .select({ id: schema.shops.id, name: schema.shops.name })
    .from(schema.shops)
    .where(isNotNull(schema.shops.jumiaAccountId));

  await audit({
    action: "admin.coherence_cron",
    result: "success",
    entityType: "shop",
    metadata: { type: "sync", shops: results.length, results },
  });

  return ok({
    boutiquesLiees: inspection.length,
    boutiquesPerimees: shops.length,
    relances: results.filter((r) => r.started).length,
    results,
    at: new Date().toISOString(),
  });
}

/** GET — vérification de disponibilité (sans effet de bord). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(500, "CRON_SECRET n'est pas configuré.");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) return fail(401, "Non autorisé.");

  const shops = await listStaleAttachedShops();
  return ok({ shops: shops.length, protected: true });
}
