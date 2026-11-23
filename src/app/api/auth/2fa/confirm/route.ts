import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { confirmTwoFactorSetup } from "@/lib/two-factor";
import { z } from "zod";

const schema = z.object({ code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres attendu.") });

/** POST /api/auth/2fa/confirm — active la 2FA après vérification du premier code. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Code invalide.");

  const result = await confirmTwoFactorSetup(user.id, parsed.data.code);
  if (!result.ok) return fail(400, result.reason);

  await audit({
    action: "auth.two_factor_enabled",
    result: "success",
    userId: user.id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
  });

  // Les codes de secours ne sont renvoyés qu'une seule fois.
  return ok({ enabled: true, recoveryCodes: result.recoveryCodes });
}
