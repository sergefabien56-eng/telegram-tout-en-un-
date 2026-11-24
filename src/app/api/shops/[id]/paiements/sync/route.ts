import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { getShopAccess } from "@/lib/permissions";
import { syncShopPayments } from "@/lib/payments-sync";

type Params = { params: Promise<{ id: string }> };

/** POST /api/shops/:id/paiements/sync — relit les relevés de versement Jumia. */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const access = await getShopAccess(user.id, id);
  if (!access?.permissions.has("finance:write")) {
    return fail(403, "Permission insuffisante pour synchroniser les paiements.");
  }

  let createdAfter: string | undefined;
  try {
    const body = (await request.json()) as { createdAfter?: unknown };
    if (typeof body?.createdAfter === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.createdAfter)) {
      createdAfter = body.createdAfter;
    }
  } catch {
    // corps vide : fenêtre par défaut de Jumia (90 jours)
  }

  try {
    const result = await syncShopPayments({
      userId: user.id,
      shopId: id,
      createdAfter,
    });
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation impossible.";
    await audit({
      action: "shop.payments_synced",
      result: "failure",
      userId: user.id,
      entityType: "shop",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: message },
    });
    return fail(message.includes("déjà en cours") ? 409 : 502, message);
  }
}
