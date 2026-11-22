import { audit } from "@/lib/audit";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { generateToken, sha256Hex } from "@/lib/crypto";
import { formatZodErrors, requestPasswordResetSchema } from "@/lib/validation";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Durée de validité du lien de réinitialisation. */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));
  }

  const { email } = parsed.data;
  const db = getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  const user = rows[0];

  if (!user) {
    // Réponse identique : on ne révèle pas si l'adresse existe.
    return ok({ message: "Si un compte existe pour cette adresse, un lien a été généré." });
  }

  const token = generateToken();
  await db.insert(schema.passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  await audit({
    action: "auth.password_reset_requested",
    result: "success",
    userId: user.id,
    ip,
    userAgent,
  });

  // L'envoi d'e-mail n'est pas encore branché (service d'e-mail non configuré).
  // Le jeton est retourné uniquement en développement pour permettre le test.
  const devToken = process.env.NODE_ENV === "production" ? undefined : token;
  return ok({
    message: "Si un compte existe pour cette adresse, un lien a été généré.",
    devToken,
  });
}
