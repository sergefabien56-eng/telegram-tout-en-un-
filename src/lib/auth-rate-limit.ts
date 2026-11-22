import { getDb, schema } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * Limitation des tentatives de connexion (R4).
 * Seuils fixes et publics (l'utilisateur est prévenu honnêtement).
 */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Adresse IP de la requête (entêtes de proxy standard, en production). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "inconnu";
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  const db = getDb();
  await db.insert(schema.loginAttempts).values({ email, ip, success });
}

/**
 * Compte les échecs récents pour une IP donnée.
 * En cas d'absence de base, on n'enregistre rien et on n'interdit pas.
 */
export async function recentFailedAttempts(ip: string): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.ip, ip),
        eq(schema.loginAttempts.success, false),
        gte(schema.loginAttempts.createdAt, since),
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function isLoginBlocked(ip: string): Promise<boolean> {
  return (await recentFailedAttempts(ip)) >= LOGIN_MAX_ATTEMPTS;
}
