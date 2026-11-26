import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { readAutoSyncState, startAutoSync } from "@/lib/auto-sync";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/shops/:id/auto-sync — état de fraîcheur des données de la
 * boutique.
 *
 * L'interface l'interroge périodiquement pour savoir si une relecture a eu
 * lieu : c'est ce qui permet d'afficher la nouvelle commande **sans** que le
 * vendeur recharge la page.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("orders:read")) {
    return fail(403, "Permission insuffisante (orders:read).");
  }

  const state = await readAutoSyncState(id);
  if (!state) return fail(404, "Boutique introuvable.");
  return ok(state);
}

/**
 * POST /api/shops/:id/auto-sync — déclenche une relecture automatique si
 * les données sont périmées.
 *
 * Permission `orders:read` : la relecture ne modifie **rien** côté Jumia,
 * elle rapporte la donnée réelle dans notre base. La lecture est déjà
 * accessible à ce rôle ; refuser la fraîcheur de l'information n'aurait
 * aucun sens.
 *
 * L'appel est **idempotent** : si une relecture est déjà en cours ou si les
 * données sont à jour, rien ne part. Le verrou de la boutique empêche
 * deux relectures simultanées.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("orders:read")) {
    return fail(403, "Permission insuffisante (orders:read).");
  }

  const result = await startAutoSync({ userId: user.id, shopId: id });

  if (result.started) {
    await audit({
      action: "shop.orders_auto_synced",
      result: "success",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      metadata: { fenetre: "7 jours", followUpdates: true },
    });
  }

  // 200 même si rien n'est parti : l'interface veut un état, pas une erreur.
  return ok({
    started: result.started,
    reason: result.reason ?? null,
    state: result.state,
  });
}
