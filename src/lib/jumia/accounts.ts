import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import {
  emailFromAccessToken,
  exchangeAccessToken,
  JumiaError,
  readAccountCredentials,
} from "./client";
import { listRemoteShops } from "./shops";

/** Validation des identifiants saisis dans l'écran « Comptes Jumia ». */
export const jumiaAccountSchema = z.object({
  label: z.string().trim().min(2, "Nommez ce compte (2 caractères minimum).").max(80),
  // Un champ laissé vide devient `undefined` (l'e-mail reste facultatif).
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email("Adresse e-mail invalide.").max(160).optional(),
  ),
  clientId: z.string().trim().min(8, "L'identifiant client Jumia est trop court.").max(120),
  refreshToken: z.string().trim().min(20, "Le refresh token semble incomplet.").max(4000),
});
export type JumiaAccountInput = z.infer<typeof jumiaAccountSchema>;

/** Compte Jumia exposé à l'interface : aucun secret n'en sort. */
export type PublicJumiaAccount = {
  id: string;
  label: string;
  email: string | null;
  clientId: string;
  status: string;
  lastTokenAt: string | null;
  linkedShops: number;
};

/** Champs nécessaires à l'affichage (jamais le jeton). */
type AccountRow = {
  id: string;
  label: string;
  email: string | null;
  clientId: string;
  status: string;
  lastTokenAt: Date | null;
};

function toPublic(row: AccountRow, linkedShops: number): PublicJumiaAccount {
  return {
    id: row.id,
    label: row.label,
    email: row.email,
    // L'identifiant client n'est pas un secret (il figure dans l'URL OAuth).
    clientId: row.clientId,
    status: row.status,
    lastTokenAt: row.lastTokenAt ? row.lastTokenAt.toISOString() : null,
    linkedShops,
  };
}

/**
 * Comptes Jumia de l'utilisateur, avec le nombre de boutiques rattachées.
 *
 * La liste ne contient jamais le refresh token ni sa forme chiffrée.
 */
export async function listJumiaAccounts(userId: string): Promise<PublicJumiaAccount[]> {
  const rows = await getDb()
    .select({
      id: schema.jumiaAccounts.id,
      label: schema.jumiaAccounts.label,
      email: schema.jumiaAccounts.email,
      clientId: schema.jumiaAccounts.clientId,
      status: schema.jumiaAccounts.status,
      lastTokenAt: schema.jumiaAccounts.lastTokenAt,
      linkedShops: sql<number>`count(${schema.shops.id})::int`,
    })
    .from(schema.jumiaAccounts)
    .leftJoin(schema.shops, eq(schema.shops.jumiaAccountId, schema.jumiaAccounts.id))
    .where(eq(schema.jumiaAccounts.ownerUserId, userId))
    .groupBy(schema.jumiaAccounts.id)
    .orderBy(schema.jumiaAccounts.createdAt);

  return rows.map((row) => toPublic(row, Number(row.linkedShops)));
}

/** Lecture interne d'un compte (existence + propriété). */
async function findOwnedAccount(userId: string, accountId: string) {
  const rows = await getDb()
    .select()
    .from(schema.jumiaAccounts)
    .where(
      and(
        eq(schema.jumiaAccounts.id, accountId),
        eq(schema.jumiaAccounts.ownerUserId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ajoute un compte vendeur Jumia depuis l'application.
 *
 * Le refresh token est immédiatement échangé contre un access token : seules
 * les identifiants réellement acceptés par Jumia sont conservées. Le nouveau
 * refresh token (Jumia fait tourner le jeton à chaque appel) est stocké chiffré.
 */
export async function createJumiaAccount(
  userId: string,
  input: JumiaAccountInput,
): Promise<{ account?: PublicJumiaAccount; error?: string }> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return { error: "ENCRYPTION_KEY manquante sur le serveur." };

  const duplicate = await getDb()
    .select({ id: schema.jumiaAccounts.id })
    .from(schema.jumiaAccounts)
    .where(
      and(
        eq(schema.jumiaAccounts.ownerUserId, userId),
        eq(schema.jumiaAccounts.clientId, input.clientId),
      ),
    )
    .limit(1);
  if (duplicate[0]) {
    return { error: "Ce compte Jumia est déjà enregistré." };
  }

  let exchanged;
  try {
    exchanged = await exchangeAccessToken({
      clientId: input.clientId,
      refreshToken: input.refreshToken,
    });
  } catch (error) {
    return { error: error instanceof JumiaError ? error.message : "Jumia a refusé ces identifiants." };
  }

  const email = input.email?.trim() || emailFromAccessToken(exchanged.accessToken) || null;
  // Enveloppe JSON chiffrée : `readAccountCredentials` s'attend à
  // `{clientId, refreshToken}` (le jeton tourne à chaque appel).
  const ciphertext = encryptText(
    JSON.stringify({ clientId: input.clientId, refreshToken: exchanged.nextRefreshToken }),
    secret,
  );

  try {
    const inserted = await getDb()
      .insert(schema.jumiaAccounts)
      .values({
        ownerUserId: userId,
        label: input.label.trim(),
        email,
        clientId: input.clientId,
        refreshTokenCiphertext: ciphertext,
        status: "active",
        lastTokenAt: new Date(),
      })
      .returning();

    await audit({
      action: "jumia.account_added",
      result: "success",
      userId,
      entityType: "jumia_account",
      metadata: { label: input.label.trim(), email },
    });

    const row = inserted[0];
    if (!row) return { error: "Enregistrement du compte impossible." };
    return { account: toPublic(row, 0) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unique")) return { error: "Ce compte Jumia est déjà enregistré." };
    return { error: "Enregistrement du compte impossible." };
  }
}

/** Un compte Jumia appartient-il à cet utilisateur ? */
export async function isOwnedBy(userId: string, accountId: string): Promise<boolean> {
  const row = await findOwnedAccount(userId, accountId);
  return Boolean(row);
}

/**
 * Compte à utiliser quand l'écran n'en précise pas :
 * le compte déjà rattaché à la boutique, sinon le premier compte enregistré.
 * Renvoie `null` si l'utilisateur n'a aucun compte (on retombe alors sur
 * l'identifiant historique unique).
 */
export async function resolveDefaultAccount(
  userId: string,
  shopId?: string,
): Promise<string | null> {
  if (shopId) {
    const rows = await getDb()
      .select({ jumiaAccountId: schema.shops.jumiaAccountId })
      .from(schema.shops)
      .where(eq(schema.shops.id, shopId))
      .limit(1);
    const linked = rows[0]?.jumiaAccountId;
    if (linked && (await isOwnedBy(userId, linked))) return linked;
  }
  const accounts = await listJumiaAccounts(userId);
  return accounts[0]?.id ?? null;
}

/** Supprime un compte Jumia (les boutiques rattachées redeviennent « non liées »). */
export async function deleteJumiaAccount(
  userId: string,
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const account = await findOwnedAccount(userId, accountId);
  if (!account) return { ok: false, error: "Compte introuvable." };

  const linked = await getDb()
    .select({ id: schema.shops.id })
    .from(schema.shops)
    .where(eq(schema.shops.jumiaAccountId, accountId))
    .limit(1);
  if (linked[0]) {
    return { ok: false, error: "Des boutiques sont encore rattachées à ce compte." };
  }

  await getDb().delete(schema.jumiaAccounts).where(eq(schema.jumiaAccounts.id, accountId));
  await audit({
    action: "jumia.account_removed",
    result: "success",
    userId,
    entityType: "jumia_account",
    metadata: { label: account.label, email: account.email },
  });
  return { ok: true };
}

/**
 * Teste un compte déjà enregistré et renvoie les boutiques qu'il donne accès.
 * Utilisé par le bouton « Tester » de l'écran Comptes Jumia.
 */
export async function testJumiaAccount(
  accountId: string,
): Promise<{ ok: boolean; shops: number; names: string[]; error?: string }> {
  const credentials = await readAccountCredentials(accountId);
  if (!credentials) return { ok: false, shops: 0, names: [], error: "Compte illisible." };
  try {
    const remote = await listRemoteShops({ accountId });
    return {
      ok: true,
      shops: remote.length,
      names: remote.map((shop) => shop.name),
    };
  } catch (error) {
    return {
      ok: false,
      shops: 0,
      names: [],
      error: error instanceof JumiaError ? error.message : "Test impossible.",
    };
  }
}
