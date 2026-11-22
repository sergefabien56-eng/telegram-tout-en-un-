import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { sha256Hex } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { formatZodErrors, resetPasswordSchema } from "@/lib/validation";
import { getDb, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

export async function POST(request: Request) {
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));
  }

  const { token, password } = parsed.data;
  const db = getDb();

  const rows = await db
    .select({
      id: schema.passwordResetTokens.id,
      userId: schema.passwordResetTokens.userId,
      expiresAt: schema.passwordResetTokens.expiresAt,
    })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, sha256Hex(token)),
        isNull(schema.passwordResetTokens.usedAt),
      ),
    )
    .limit(1);

  const reset = rows[0];
  if (!reset) return fail(400, "Lien invalide ou déjà utilisé.");
  if (reset.expiresAt.getTime() < Date.now()) {
    return fail(400, "Ce lien a expiré. Faites une nouvelle demande.");
  }

  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
    .where(eq(schema.users.id, reset.userId));

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.id, reset.id));

  // Sécurité : invalider toutes les sessions existantes après un changement de mot de passe.
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.sessions.userId, reset.userId));

  await audit({
    action: "auth.password_reset_completed",
    result: "success",
    userId: reset.userId,
    ip,
    userAgent,
  });

  return ok({ message: "Mot de passe modifié. Connectez-vous avec le nouveau mot de passe." });
}
