import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { orderScope } from "@/lib/order-access";
import {
  countUnreadOrderAlerts,
  listActiveOrderAlerts,
  reconcileOrderAlerts,
} from "@/lib/order-alerts";

/**
 * GET /api/order-alerts — alertes de commandes du périmètre de l'utilisateur.
 *
 * L'interface **polle** cette route : les alertes se mettent à jour toutes
 * les minutes, sans rechargement manuel, quand l'application est ouverte.
 *
 * La route reste purement **in-application** : aucune notification n'est
 * envoyée en dehors de l'application (ni Telegram, ni e-mail, ni push).
 */

/** Délai minimal entre deux réconciliations automatiques (ms). */
const INTERVALLE_RECONCILIATION_MS = 20_000;

let derniereReconciliation = 0;

/**
 * Réconciliation throttlée : évite qu'une forte affluence de polls ne
 * multiplie les écritures. La réconciliation est idempotente : l'appeler
 * plus souvent ne change rien au résultat.
 */
async function reconcilierSiNecessaire(shopIds: string[], force = false): Promise<void> {
  const maintenant = Date.now();
  if (!force && maintenant - derniereReconciliation < INTERVALLE_RECONCILIATION_MS) return;
  derniereReconciliation = maintenant;
  try {
    await reconcileOrderAlerts({ shopIds });
  } catch (error) {
    console.error("[alertes] réconciliation impossible", error);
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const scope = await orderScope(user.id);
  const shopIds = scope.allowed.map((shop) => shop.id);

  // `?force=1` : le vendeur a cliqué sur « Actualiser », on recalcule
  // immédiatement au lieu d'attendre la fin du délai de déduplication.
  const force = new URL(request.url).searchParams.get("force") === "1";
  await reconcilierSiNecessaire(shopIds, force);

  const [alerts, unread] = await Promise.all([
    listActiveOrderAlerts({ userId: user.id, shopIds }),
    countUnreadOrderAlerts({ userId: user.id, shopIds }),
  ]);

  return ok({
    alerts,
    unread,
    shops: scope.allowed.map((shop) => ({ id: shop.id, name: shop.name })),
    refreshedAt: new Date().toISOString(),
  });
}
