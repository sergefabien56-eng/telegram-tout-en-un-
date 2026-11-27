import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { markOrderAlertRead } from "@/lib/order-alerts";
import { isUuid } from "@/lib/ids";

/**
 * POST /api/order-alerts/[id]/read — marque une alerte comme vue.
 *
 * La lecture est **personnelle** : l'alerte elle-même est partagée par les
 * membres de la boutique, mais chacun garde son propre état « vu / non vu ».
 * C'est ce qui permet de présenter comme **non vues** les commandes
 * arrivées pendant l'absence.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { id } = await params;
  if (!isUuid(id)) return fail(400, "Identifiant d'alerte invalide.");

  const marked = await markOrderAlertRead({ userId: user.id, alertId: id });
  if (!marked) return fail(404, "Alerte introuvable.");

  return ok({ read: true });
}
