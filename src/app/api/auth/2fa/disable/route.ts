import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { disableTwoFactor } from "@/lib/two-factor";
import { z } from "zod";

const schema = z.object({ password: z.string().min(1, "Mot de passe requis.") });

/** POST /api/auth/2fa/disable — désactive la 2FA (mot de passe requis). */
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
  if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Formulaire invalide.");

  const result = await disableTwoFactor(user.id, parsed.data.password);
  if (!result.ok) return fail(403, result.reason);

  await audit({
    action: "auth.two_factor_disabled",
    result: "success",
    userId: user.id,
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
  });

  return ok({ enabled: false });
}
