import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { deleteJumiaAccount, testJumiaAccount } from "@/lib/jumia/accounts";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/jumia/accounts/:id — supprime un compte (owner uniquement). */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const result = await deleteJumiaAccount(user.id, id);
  if (!result.ok) {
    await audit({
      action: "jumia.account_removed",
      result: "blocked",
      userId: user.id,
      entityType: "jumia_account",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.error?.slice(0, 200) },
    });
    return fail(409, result.error ?? "Suppression impossible.");
  }

  return ok({ deleted: true });
}

/**
 * POST /api/jumia/accounts/:id/test — vérifie que le compte donne accès aux
 * boutiques attendues (bouton « Tester » de l'écran Comptes Jumia).
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const result = await testJumiaAccount(id);
  await audit({
    action: "admin.jumia_test",
    result: result.ok ? "success" : "failure",
    userId: user.id,
    entityType: "jumia_account",
    entityId: id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { shops: result.shops, error: result.error?.slice(0, 200) },
  });

  if (!result.ok) return fail(502, result.error ?? "Test du compte impossible.");
  return ok({ shops: result.shops, names: result.names });
}
