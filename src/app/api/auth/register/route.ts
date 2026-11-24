import { audit } from "@/lib/audit";
import { createSession, sessionCookieOptions } from "@/lib/session";
import { formatZodErrors, registerSchema } from "@/lib/validation";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";
import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Corps de requête invalide (JSON attendu).");
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Formulaire invalide.", formatZodErrors(parsed.error));
  }

  const input = parsed.data;
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);

  const db = getDb();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (existing[0]) {
    await audit({
      action: "auth.register",
      result: "failure",
      ip,
      userAgent,
      metadata: { email: input.email },
    });
    // Message volontairement identique à un succès pour ne pas révéler l'existence du compte.
    return ok({ message: "Si cette adresse n'était pas encore utilisée, un compte a été créé." });
  }

  const created = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash: hashPassword(input.password),
      fullName: input.fullName,
      locale: input.locale ?? "fr",
      timezone: input.timezone ?? "Africa/Abidjan",
    })
    .returning({ id: schema.users.id });

  const user = created[0];
  if (!user) {
    return fail(500, "Une erreur est survenue lors de la création du compte.");
  }

  const { token } = await createSession(user.id, ip, userAgent);
  const store = await cookies();
  store.set(sessionCookieOptions.name, token, sessionCookieOptions);

  await audit({ action: "auth.register", result: "success", userId: user.id, ip, userAgent });

  return ok({ id: user.id, email: input.email }, { status: 201 });
}
