import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopOrders } from "@/lib/orders-sync";
import { validateSyncWindow } from "@/lib/order-sync-policy";

type Params = { params: Promise<{ id: string }> };

function parseDay(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * POST /api/shops/:id/commandes/sync — synchronise les commandes Jumia.
 *
 * Permission `orders:write` (owner, manager).
 *
 * Deux modes, rétrocompatibles :
 * - `{ days }` : fenêtre glissante (usage historique) ;
 * - `{ from, to }` : **période choisie** par l'utilisateur (« synchroniser
 *   cette période »). Une période inversée ou de plus de 90 jours est
 *   refusée : la limite vient de l'API Jumia, pas de nous.
 *
 * `followUpdates` relit en plus les commandes **plus anciennes** dont le
 * statut a changé (`updatedAfter`) : sans cela, les changements de statut
 * postérieurs à la création ne seraient jamais vus.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access) return fail(404, "Boutique introuvable ou accès refusé.");
  if (!access.permissions.has("orders:write")) {
    return fail(403, "Permission insuffisante (orders:write).");
  }

  let days: number | undefined;
  let from: Date | null = null;
  let to: Date | null = null;
  let followUpdates = false;
  try {
    const body = (await request.json()) as {
      days?: unknown;
      from?: unknown;
      to?: unknown;
      followUpdates?: unknown;
    };
    if (typeof body?.days === "number" && Number.isFinite(body.days)) days = body.days;
    if (typeof body?.from === "string") from = parseDay(body.from);
    if (typeof body?.to === "string") to = parseDay(body.to, true);
    if (typeof body?.followUpdates === "boolean") followUpdates = body.followUpdates;
  } catch {
    // corps vide : on garde la valeur par défaut (30 jours)
  }

  // Période explicite : les bornes doivent être cohérentes.
  if (from || to) {
    const fenetre = validateSyncWindow(from, to);
    if (!fenetre.ok) return fail(400, fenetre.reason);
  }

  const result = await syncShopOrders({
    userId: user.id,
    shopId: id,
    days,
    from: from ?? undefined,
    to: to ?? undefined,
    followUpdates,
    requestMeta: { ip: requestIp(request), userAgent: requestUserAgent(request) },
  });

  if (!result.ok) {
    const running = result.reason?.includes("déjà en cours");
    await audit({
      action: "shop.orders_synced",
      result: "blocked",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.reason ?? "inconnue" },
    });
    // 409 = un autre appel est déjà en train ou la boutique n'est pas prête.
    const status = running || result.reason?.includes("rattachée") ? 409 : 502;
    return fail(status, result.reason ?? "Synchronisation impossible.");
  }

  return ok(result);
}
