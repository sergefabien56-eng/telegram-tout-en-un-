import { eq } from "drizzle-orm";
import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/ids";
import { getDb, schema } from "@/db";
import { CLE_DELAI_PREVENTIF, DEFAUT_DELAI_PREVENTIF_H } from "@/lib/order-alerts";

export const dynamic = "force-dynamic";

/**
 * POST /api/shops/[id]/alertes/delai — fixe le seuil préventif de préparation
 * d'une boutique, en heures.
 *
 * **Pourquoi ce réglage existe.** Les délais de préparation diffèrent d'une
 * boutique et d'un processus à l'autre. L'API Vendor Center de Jumia
 * n'expose **aucun** endpoint de délai de préparation : la seule source
 * fiable est la règle du vendeur, saisie ici. La valeur par défaut reste
 * 24 h, seuil **préventif** de priorisation — jamais une heure d'annulation
 * garantie par Jumia.
 *
 * Le contrôle des droits est fait **côté serveur** : seuls les rôles
 * autorisés sur la boutique (`orders:write`) peuvent modifier ce seuil.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "Boutique introuvable.");

  const autorise = await can(user.id, id, "orders:write");
  if (!autorise) {
    return fail(403, "Votre rôle ne permet pas de régler ce seuil sur cette boutique.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }
  const heures = Number((body as { heures?: unknown })?.heures);
  if (!Number.isFinite(heures) || heures < 1 || heures > 240) {
    return fail(422, "Le seuil doit être un nombre d'heures entre 1 et 240.");
  }

  const cle = `${CLE_DELAI_PREVENTIF}.${id}`;
  await getDb()
    .insert(schema.appSettings)
    .values({ key: cle, value: { heures }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: { heures }, updatedAt: new Date() },
    });

  // Les alertes sont recalculées immédiatement : le nouveau seuil s'applique
  // sans attendre le prochain passage.
  const { reconcileOrderAlerts } = await import("@/lib/order-alerts");
  await reconcileOrderAlerts({ shopIds: [id] });

  return ok({
    shopId: id,
    heures,
    defaut: DEFAUT_DELAI_PREVENTIF_H,
  });
}

/** GET /api/shops/[id]/alertes/delai — seuil appliqué à la boutique. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "Boutique introuvable.");

  const autorise = await can(user.id, id, "orders:read");
  if (!autorise) return fail(403, "Permission insuffisante (orders:read).");

  const rows = await getDb()
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, `${CLE_DELAI_PREVENTIF}.${id}`))
    .limit(1);
  const raw = rows[0]?.value as { heures?: unknown } | null;
  const heures = typeof raw?.heures === "number" ? raw.heures : DEFAUT_DELAI_PREVENTIF_H;

  return ok({ shopId: id, heures, defaut: DEFAUT_DELAI_PREVENTIF_H });
}
