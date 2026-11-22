import { getDb, schema } from "@/db";
import { sha256Hex } from "@/lib/crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/cookies";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * Sessions serveur (R4) — le cookie ne contient qu'un jeton opaque ;
 * seule son empreinte SHA-256 est stockée en base.
 */
export async function createSession(userId: string, ip: string | null, userAgent: string | null) {
  const db = getDb();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(schema.sessions).values({
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
    ip,
    userAgent,
  });

  return { token, expiresAt };
}

/** Décode le cookie de session (nécessite le contexte Next.js). */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Résout le cookie en utilisateur authentifié, ou null. */
export async function getSessionUser() {
  const token = await readSessionToken();
  if (!token) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      fullName: schema.users.fullName,
      isActive: schema.users.isActive,
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, sha256Hex(token)),
        isNull(schema.sessions.revokedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (!row.isActive) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    sessionId: row.sessionId,
  };
}

/** Invalide la session courante. */
export async function revokeSession(sessionId: string) {
  const db = getDb();
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

/** Utilitaires cookies (pour les routes API). */
export const sessionCookieOptions = {
  name: SESSION_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
