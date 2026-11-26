import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopLabels } from "@/lib/labels-sync";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shops/:id/etiquettes/generer — demande les étiquettes
 * d'expédition à Jumia (`POST /orders/print-labels`).
 *
 * Permission `orders:write` (owner, manager) : imprimer une étiquette
 * engage la boutique auprès du transporteur.
 *
 * Le corps est facultatif : `{ orderIds?: string[] }` permet de cibler
 * quelques commandes ; par défaut, toutes les commandes ayant un article
 * prêt à expédier sont concernées.
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

  let orderIds: string[] | undefined;
  let from: Date | undefined;
  let to: Date | undefined;
  try {
    const body = (await request.json()) as {
      orderIds?: unknown;
      from?: unknown;
      to?: unknown;
    };
    if (Array.isArray(body?.orderIds)) {
      orderIds = body.orderIds.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      );
    }
    // Période de création des commandes concernées (dates UTC).
    if (typeof body?.from === "string") {
      const debut = new Date(`${body.from}T00:00:00.000Z`);
      if (!Number.isNaN(debut.getTime())) from = debut;
    }
    if (typeof body?.to === "string") {
      const fin = new Date(`${body.to}T23:59:59.999Z`);
      if (!Number.isNaN(fin.getTime())) to = fin;
    }
  } catch {
    // Corps vide : toutes les commandes éligibles sont concernées.
  }

  const result = await syncShopLabels({
    userId: user.id,
    shopId: id,
    orderIds,
    from,
    to,
    requestMeta: { ip: requestIp(request), userAgent: requestUserAgent(request) },
  });

  if (!result.ok) {
    const running = result.reason?.includes("déjà en cours");
    await audit({
      action: "shop.labels_generated",
      result: "blocked",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.reason ?? "inconnue" },
    });
    return fail(running ? 409 : 502, result.reason ?? "Impression impossible.");
  }

  return ok(result);
}
