import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { isOwnedBy, testJumiaAccount } from "@/lib/jumia/accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/jumia/accounts/:id/test — vérifie qu'un compte enregistre donne
 * accès aux boutiques attendues (bouton « Tester » de l'écran Comptes Jumia).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  if (!(await isOwnedBy(user.id, id))) return fail(403, "Ce compte Jumia ne vous appartient pas.");

  const result = await testJumiaAccount(user.id, id);
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
