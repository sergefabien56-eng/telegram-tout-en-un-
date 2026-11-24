import { audit } from "@/lib/audit";
import { fail, ok, requestUserAgent } from "@/lib/http";
import { clientIp, isLoginBlocked, recordLoginAttempt } from "@/lib/auth-rate-limit";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { issueTwoFactorChallenge } from "@/lib/totp";
import { hashPassword, verifyPassword } from "@/lib/password";
import { formatZodErrors, loginSchema } from "@/lib/validation";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const userAgent = requestUserAgent(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));
  }

  const { email, password } = parsed.data;

  try {
    if (await isLoginBlocked(ip)) {
      await audit({ action: "auth.account_locked", result: "blocked", ip, userAgent });
      return fail(429, "Trop de tentatives. Réessayez dans 15 minutes.");
    }
    return await authenticate(email, password, ip, userAgent);
  } catch {
    // Base inaccessible : mieux vaut un 503 clair qu'une page d'erreur brute.
    return fail(503, "Service temporairement indisponible (base de données).");
  }
}

/**
 * Authentification proprement dite. Séparée pour qu'une base indisponible
 * renvoie une réponse française lisible au lieu d'une erreur 500.
 */
async function authenticate(email: string, password: string, ip: string, userAgent: string | null) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      passwordHash: schema.users.passwordHash,
      isActive: schema.users.isActive,
      fullName: schema.users.fullName,
      twoFactorEnabled: schema.users.twoFactorEnabled,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const user = rows[0];

  // Vérification à temps constant : on hache toujours, même sans compte.
  const candidate = user?.passwordHash ?? hashPassword("dummy-pour-temps-constant");
  const passwordOk = verifyPassword(password, candidate);

  if (!user || !passwordOk) {
    await recordLoginAttempt(email, ip, false);
    await audit({
      action: "auth.login_failed",
      result: "failure",
      ip,
      userAgent,
      metadata: { email },
    });
    return fail(401, "Adresse e-mail ou mot de passe incorrect.");
  }

  if (!user.isActive) {
    await recordLoginAttempt(email, ip, false);
    await audit({ action: "auth.login_failed", result: "blocked", userId: user.id, ip, userAgent });
    return fail(403, "Ce compte est désactivé. Contactez l'administrateur.");
  }

  await recordLoginAttempt(email, ip, true);

  // 2FA activée : le mot de passe est validé, il reste le second facteur.
  if (user.twoFactorEnabled) {
    await audit({
      action: "auth.login",
      result: "success",
      userId: user.id,
      ip,
      userAgent,
      metadata: { step: "password_ok_2fa_required" },
    });
    return ok({ requiresTwoFactor: true, challenge: issueTwoFactorChallenge(user.id) });
  }

  const { token } = await createSession(user.id, ip, userAgent);
  const store = await cookies();
  store.set(sessionCookieOptions.name, token, sessionCookieOptions);

  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await audit({ action: "auth.login", result: "success", userId: user.id, ip, userAgent });

  return ok({ id: user.id, email, fullName: user.fullName });
}
