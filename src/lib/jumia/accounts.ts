import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/ids";
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
  // Un identifiant malformé ne désigne aucun compte : on le traite comme
  // inexistant plutôt que de faire échouer la requête SQL.
  if (!isUuid(accountId)) return null;
  const rows = await getDb()
    .select()
    .from(schema.jumiaAccounts)
    .where(
      and(eq(schema.jumiaAccounts.id, accountId), eq(schema.jumiaAccounts.ownerUserId, userId)),
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
    return {
      error: error instanceof JumiaError ? error.message : "Jumia a refusé ces identifiants.",
    };
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

    // L'audit est écrit par la route (avec IP et user-agent) : pas de doublon.
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
 * Compte vendeur Jumia **explicitement lié** à une boutique.
 *
 * Aucun repli : c'est la garantie d'isolation entre boutiques. Une boutique
 * sans compte lié ne synchronise pas (plutôt que de lire le compte d'une
 * autre boutique, ce qui mélangerait les données).
 */
export async function accountIdForShop(shopId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ id: schema.shops.jumiaAccountId })
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Compte à utiliser quand l'écran n'en précise pas : uniquement celui déjà
 * lié à la boutique. Ne renvoie jamais le compte d'une autre boutique.
 */
export async function resolveDefaultAccount(
  userId: string,
  shopId?: string,
): Promise<string | null> {
  if (!shopId) return null;
  const linked = await accountIdForShop(shopId);
  if (linked && (await isOwnedBy(userId, linked))) return linked;
  return null;
}

/**
 * Code du client commercial d'une boutique (ex. « jumia-ci »).
 *
 * C'est ce code qui porte le **prix local** chez Jumia : sans lui, la
 * création d'un produit n'a pas de prix pour le marché de la boutique.
 */
export async function businessClientCodeForShop(shopId: string): Promise<string | null> {
  const rows = await getDb()
    .select({
      remoteShopId: schema.shops.remoteShopId,
      jumiaAccountId: schema.shops.jumiaAccountId,
    })
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  const shop = rows[0];
  if (!shop?.remoteShopId || !shop.jumiaAccountId) return null;
  try {
    const remote = await listRemoteShops({ accountId: shop.jumiaAccountId });
    const cible = remote.find((entry) => entry.id === shop.remoteShopId);
    return cible?.businessClients[0]?.code ?? null;
  } catch {
    return null;
  }
}

/** Devise par pays Jumia (R3 : une boutique doit avoir la bonne devise). */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  CI: "XOF",
  SN: "XOF",
  BJ: "XOF",
  TG: "XOF",
  ML: "XOF",
  BF: "XOF",
  CM: "XAF",
  GA: "XAF",
  NG: "NGN",
  KE: "KES",
  GH: "GHS",
  UG: "UGX",
  TZ: "TZS",
  ZA: "ZAR",
  EG: "EGP",
  MA: "MAD",
  DZ: "DZD",
  TN: "TND",
};

/**
 * Crée la boutique locale et la rattache à une boutique Jumia accessible sur
 * un compte — sans identifiant technique, sans passer par la base.
 *
 * Refuse si la boutique distante n'existe pas sur ce compte, si elle est déjà
 * rattachée, ou si le pays n'a pas de devise connue (mieux vaut demander que
 * d'inventer une devise, R3).
 */
export type AttachedShop = { id: string; name: string; currency: string };

export async function attachRemoteShop(
  userId: string,
  accountId: string,
  remoteShopId: string,
): Promise<
  | { ok: true; shop: AttachedShop }
  | {
      ok: false;
      error: string;
      code: "not_found" | "already_linked" | "no_currency" | "forbidden";
    }
> {
  if (!(await isOwnedBy(userId, accountId))) {
    return { ok: false, error: "Ce compte Jumia ne vous appartient pas.", code: "forbidden" };
  }

  let remote;
  try {
    const shops = await listRemoteShops({ accountId });
    remote = shops.find((shop) => shop.id === remoteShopId) ?? null;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof JumiaError ? error.message : "Lecture des boutiques impossible.",
      code: "not_found",
    };
  }
  if (!remote) {
    return { ok: false, error: "Cette boutique n'existe pas sur ce compte.", code: "not_found" };
  }

  // Unicité du rattachement : une boutique distante = une boutique locale.
  const existing = await getDb()
    .select({ id: schema.shops.id, name: schema.shops.name })
    .from(schema.shops)
    .where(eq(schema.shops.remoteShopId, remote.id))
    .limit(1);
  if (existing[0]) {
    return {
      ok: false,
      error: `« ${remote.name} » est déjà rattachée à la boutique « ${existing[0].name} ».`,
      code: "already_linked",
    };
  }

  const country = remote.countries[0]?.code ?? "";
  const currency = CURRENCY_BY_COUNTRY[country];
  if (!currency) {
    return {
      ok: false,
      error: `Pays « ${country || "inconnu"} » sans devise reconnue : créez la boutique manuellement.`,
      code: "no_currency",
    };
  }

  // Si une boutique locale au même nom existe déjà sans rattachement
  // (créée à la main juste avant), on la complète au lieu de créer un doublon.
  const orphan = await getDb()
    .select({ id: schema.shops.id })
    .from(schema.shops)
    .where(
      and(
        eq(schema.shops.ownerUserId, userId),
        eq(schema.shops.name, remote.name),
        isNull(schema.shops.remoteShopId),
      ),
    )
    .limit(1);

  if (orphan[0]) {
    try {
      const updated = await getDb()
        .update(schema.shops)
        .set({
          platform: "jumia",
          country: country || null,
          currency,
          remoteShopId: remote.id,
          remoteShopName: remote.name,
          remoteLinkedAt: new Date(),
          jumiaAccountId: accountId,
          updatedAt: new Date(),
        })
        .where(eq(schema.shops.id, orphan[0].id))
        .returning();
      return {
        ok: true,
        shop: { id: updated[0]?.id ?? orphan[0].id, name: remote.name, currency },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("unique")) {
        return {
          ok: false,
          error: "Cette boutique Jumia est déjà rattachée.",
          code: "already_linked",
        };
      }
      return { ok: false, error: "Rattachement impossible.", code: "not_found" };
    }
  }

  try {
    const created = await getDb().transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.shops)
        .values({
          ownerUserId: userId,
          name: remote.name,
          platform: "jumia",
          // Identifiant interne stable, dérivé de la boutique distante.
          externalShopId: `jumia-${remote.id.slice(0, 8)}`,
          country: country || null,
          currency,
          remoteShopId: remote.id,
          remoteShopName: remote.name,
          remoteLinkedAt: new Date(),
          jumiaAccountId: accountId,
        })
        .returning();
      const shop = inserted[0];
      if (!shop) throw new Error("Création de la boutique impossible.");
      await tx.insert(schema.shopMembers).values({ shopId: shop.id, userId, role: "owner" });
      return shop;
    });

    return { ok: true, shop: { id: created.id, name: created.name, currency } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unique")) {
      return { ok: false, error: "Cette boutique est déjà enregistrée.", code: "already_linked" };
    }
    return { ok: false, error: "Création de la boutique impossible.", code: "not_found" };
  }
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
  userId: string,
  accountId: string,
): Promise<{ ok: boolean; shops: number; names: string[]; error?: string }> {
  if (!(await isOwnedBy(userId, accountId))) {
    return { ok: false, shops: 0, names: [], error: "Ce compte Jumia ne vous appartient pas." };
  }
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
