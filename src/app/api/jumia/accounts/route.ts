import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import {
  createJumiaAccount,
  jumiaAccountSchema,
  listJumiaAccounts,
} from "@/lib/jumia/accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/jumia/accounts — comptes vendeur Jumia enregistrés (propriétaire).
 * Aucun jeton n'est renvoyé.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  try {
    return ok({ accounts: await listJumiaAccounts(user.id) });
  } catch {
    return fail(500, "Lecture des comptes Jumia impossible.");
  }
}

/**
 * POST /api/jumia/accounts — ajoute un compte vendeur depuis l'application.
 * Les identifiants sont validés auprès de Jumia avant d'être stockés chiffrés.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = jumiaAccountSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, parsed.error.issues[0]?.message ?? "Identifiants invalides.");
  }

  const result = await createJumiaAccount(user.id, parsed.data);
  if (result.error) {
    await audit({
      action: "jumia.account_added",
      result: "failure",
      userId: user.id,
      entityType: "jumia_account",
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.error.slice(0, 200) },
    });
    return fail(409, result.error);
  }

  await audit({
    action: "jumia.account_added",
    result: "success",
    userId: user.id,
    entityType: "jumia_account",
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: { label: parsed.data.label.trim(), email: parsed.data.email ?? null },
  });

  return ok({ account: result.account });
}
