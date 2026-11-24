import { audit } from "@/lib/audit";
import { clientIp, isLoginBlocked, recordLoginAttempt } from "@/lib/auth-rate-limit";
import { fail, ok, requestUserAgent } from "@/lib/http";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { consumeTwoFactorChallenge } from "@/lib/totp";
import { checkSecondFactor } from "@/lib/two-factor";
import { cookies } from "next/headers";

/**
 * POST /api/auth/2fa/verify — valide le second facteur puis ouvre la session.
 * Corps : { challenge, code } (code TOTP à 6 chiffres ou code de secours).
 */
export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const userAgent = requestUserAgent(request);

  if (await isLoginBlocked(ip)) {
    return fail(429, "Trop de tentatives. Réessayez dans 15 minutes.");
  }

  let body: { challenge?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const challenge = typeof body.challenge === "string" ? body.challenge : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!challenge || !code) return fail(422, "Challenge ou code manquant.");

  const userId = consumeTwoFactorChallenge(challenge);
  if (!userId) return fail(401, "Le lien de vérification a expiré. Reconnecte-toi.");

  const result = await checkSecondFactor(userId, code);
  if (!result.ok) {
    await recordLoginAttempt("", ip, false);
    await audit({
      action: "auth.two_factor_failed",
      result: "failure",
      userId,
      ip,
      userAgent,
      metadata: { reason: result.reason },
    });
    return fail(
      401,
      result.reason === "Code à 6 chiffres attendu." ? "Code invalide." : result.reason,
    );
  }

  const { token } = await createSession(userId, ip, userAgent);
  const store = await cookies();
  store.set(sessionCookieOptions.name, token, sessionCookieOptions);

  await recordLoginAttempt("", ip, true);
  await audit({
    action: "auth.login",
    result: "success",
    userId,
    ip,
    userAgent,
    metadata: { step: "two_factor_ok", recovery: result.usedRecovery },
  });

  return ok({ requiresTwoFactor: false });
}
