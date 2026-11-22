import { getDb, schema } from "@/db";
import { sha256Hex } from "@/lib/crypto";
import { eq, sql } from "drizzle-orm";

/**
 * Liaisons de compte et commandes du bot.
 * Le code de liaison est à usage unique, stocké en empreinte SHA-256.
 */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_LENGTH = 8;

/** Génère un code lisible (majuscules + chiffres, sans ambiguïtés). */
export function generateLinkCode(bytes = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  let code = "";
  for (const value of random) code += alphabet[value % alphabet.length];
  return code.padEnd(CODE_LENGTH, "A").slice(0, CODE_LENGTH);
}

/** Crée un code de liaison pour un utilisateur connecté (web). */
export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const db = getDb();
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await db.insert(schema.accountLinkCodes).values({
    userId,
    codeHash: sha256Hex(code),
    expiresAt,
  });

  return { code, expiresAt };
}

export type LinkResult =
  | { ok: true; userId: string }
  | { ok: false; reason: string };

/** Consomme un code et associe le compte Telegram à l'utilisateur. */
export async function consumeLinkCode(
  code: string,
  telegram: { id: number; username?: string; firstName?: string; lastName?: string },
): Promise<LinkResult> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 6) return { ok: false, reason: "Code trop court." };

  const db = getDb();
  const rows = await db
    .select({
      id: schema.accountLinkCodes.id,
      userId: schema.accountLinkCodes.userId,
      expiresAt: schema.accountLinkCodes.expiresAt,
      consumedAt: schema.accountLinkCodes.consumedAt,
    })
    .from(schema.accountLinkCodes)
    .where(eq(schema.accountLinkCodes.codeHash, sha256Hex(normalized)))
    .limit(1);

  const link = rows[0];
  if (!link || link.consumedAt) return { ok: false, reason: "Code invalide ou déjà utilisé." };
  if (link.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "Code expiré. Générez-en un nouveau sur le site." };
  }

  // Associe (ou crée) le compte Telegram.
  const existing = await db
    .select({ id: schema.telegramAccounts.id })
    .from(schema.telegramAccounts)
    .where(eq(schema.telegramAccounts.telegramId, telegram.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.telegramAccounts)
      .set({
        linkedUserId: link.userId,
        linkedAt: new Date(),
        username: telegram.username ?? null,
        firstName: telegram.firstName ?? null,
        lastName: telegram.lastName ?? null,
        linkCode: null,
        linkCodeExpiresAt: null,
      })
      .where(eq(schema.telegramAccounts.id, existing[0].id));
  } else {
    await db.insert(schema.telegramAccounts).values({
      telegramId: telegram.id,
      username: telegram.username ?? null,
      firstName: telegram.firstName ?? null,
      lastName: telegram.lastName ?? null,
      linkedUserId: link.userId,
      linkedAt: new Date(),
    });
  }

  await db
    .update(schema.accountLinkCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.accountLinkCodes.id, link.id));

  return { ok: true, userId: link.userId };
}

/** Retrouve l'utilisateur local lié à un compte Telegram. */
export async function findLinkedUser(telegramId: number) {
  const db = getDb();
  const rows = await db
    .select({
      userId: schema.telegramAccounts.linkedUserId,
      email: schema.users.email,
      fullName: schema.users.fullName,
      isActive: schema.users.isActive,
    })
    .from(schema.telegramAccounts)
    .leftJoin(schema.users, eq(schema.telegramAccounts.linkedUserId, schema.users.id))
    .where(eq(schema.telegramAccounts.telegramId, telegramId))
    .limit(1);

  const row = rows[0];
  if (!row?.userId || !row.isActive) return null;
  return { userId: row.userId, email: row.email ?? "", fullName: row.fullName };
}

/** Nombre de boutiques accessibles à un utilisateur (données réelles). */
export async function countUserShops(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(distinct ${schema.shops.id})::int` })
    .from(schema.shopMembers)
    .innerJoin(schema.shops, eq(schema.shopMembers.shopId, schema.shops.id))
    .where(eq(schema.shopMembers.userId, userId));
  return rows[0]?.count ?? 0;
}

/** Enregistre une notification Telegram (traçabilité). */
export async function traceNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  status: "sent" | "failed";
  error?: string;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.notifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      status: params.status,
      sentAt: params.status === "sent" ? new Date() : null,
      error: params.error ?? null,
    });
  } catch {
    // Le traçage ne doit jamais bloquer l'envoi.
  }
}
