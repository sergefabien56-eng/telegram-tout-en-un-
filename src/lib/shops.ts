import { getDb, schema } from "@/db";
import { generateToken, sha256Hex } from "@/lib/crypto";
import { isRole, roleHasPermission, type Role } from "@/lib/roles";
import { and, eq, sql } from "drizzle-orm";

/** Durée de validité d'une invitation (7 jours). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Résultat d'action membre (literaux stricts pour le narrowing). */
export type MemberResult = { ok: true } | { ok: false; reason: string };

export type ShopInput = {
  name: string;
  platform: string;
  externalShopId: string;
  country?: string;
  currency: string;
};

/** Crée une boutique et attribue le rôle `owner` au créateur (transaction). */
export async function createShop(userId: string, input: ShopInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.shops)
      .values({
        ownerUserId: userId,
        name: input.name,
        platform: input.platform,
        externalShopId: input.externalShopId,
        country: input.country ?? null,
        currency: input.currency,
        status: "pending",
      })
      .returning();

    const shop = inserted[0];
    if (!shop) throw new Error("Création de la boutique impossible.");

    await tx.insert(schema.shopMembers).values({ shopId: shop.id, userId, role: "owner" });
    return shop;
  });
}

/** Boutiques accessibles à un utilisateur, avec son rôle. */
export async function listUserShops(userId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      platform: schema.shops.platform,
      externalShopId: schema.shops.externalShopId,
      country: schema.shops.country,
      currency: schema.shops.currency,
      status: schema.shops.status,
      remoteShopId: schema.shops.remoteShopId,
      remoteShopName: schema.shops.remoteShopName,
      remoteLinkedAt: schema.shops.remoteLinkedAt,
      lastSyncAt: schema.shops.lastSyncAt,
      lastSyncStatus: schema.shops.lastSyncStatus,
      createdAt: schema.shops.createdAt,
      role: schema.shopMembers.role,
    })
    .from(schema.shopMembers)
    .innerJoin(schema.shops, eq(schema.shopMembers.shopId, schema.shops.id))
    .where(eq(schema.shopMembers.userId, userId))
    .orderBy(sql`${schema.shops.createdAt} desc`);
}

/** Détail d'une boutique (avec rôle de l'appelant). */
export async function getShopDetail(userId: string, shopId: string) {
  const db = getDb();
  const rows = await db
    .select({
      shop: schema.shops,
      role: schema.shopMembers.role,
    })
    .from(schema.shopMembers)
    .innerJoin(schema.shops, eq(schema.shopMembers.shopId, schema.shops.id))
    .where(and(eq(schema.shopMembers.userId, userId), eq(schema.shopMembers.shopId, shopId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row.shop, role: row.role };
}

/** Met à jour une boutique (permission `shops:write` vérifiée par l'appelant). */
export async function updateShop(
  userId: string,
  shopId: string,
  patch: { name?: string; country?: string; currency?: string; status?: string },
) {
  const access = await getRole(userId, shopId);
  if (!access || !roleHasPermission(access, "shops:write")) {
    throw new Error("Permission insuffisante (shops:write).");
  }

  const db = getDb();
  const updated = await db
    .update(schema.shops)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.shops.id, shopId))
    .returning();
  return updated[0] ?? null;
}

/** Membres d'une boutique. */
export async function listMembers(shopId: string) {
  const db = getDb();
  return db
    .select({
      userId: schema.shopMembers.userId,
      role: schema.shopMembers.role,
      email: schema.users.email,
      fullName: schema.users.fullName,
      createdAt: schema.shopMembers.createdAt,
    })
    .from(schema.shopMembers)
    .innerJoin(schema.users, eq(schema.shopMembers.userId, schema.users.id))
    .where(eq(schema.shopMembers.shopId, shopId))
    .orderBy(sql`${schema.shopMembers.createdAt} asc`);
}

export type InviteResult =
  | { ok: true; status: "added"; userId: string }
  | { ok: true; status: "pending"; email: string }
  | { ok: false; reason: string };

/** Invite un membre par e-mail (ajout immédiat si le compte existe). */
export async function inviteMember(
  userId: string,
  shopId: string,
  email: string,
  role: Role,
): Promise<InviteResult> {
  const access = await getRole(userId, shopId);
  if (!access || !roleHasPermission(access, "members:write")) {
    return { ok: false, reason: "Permission insuffisante (members:write)." };
  }
  if (role === "owner") return { ok: false, reason: "Le rôle owner n'est pas attribuable." };

  const db = getDb();
  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const existing = target[0];
  if (!existing) {
    const token = generateToken();
    await db
      .insert(schema.shopInvites)
      .values({
        shopId,
        email,
        role,
        invitedById: userId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .onConflictDoNothing();
    return { ok: true, status: "pending", email };
  }

  await db
    .insert(schema.shopMembers)
    .values({ shopId, userId: existing.id, role })
    .onConflictDoNothing();
  return { ok: true, status: "added", userId: existing.id };
}

/** Supprime un membre (impossible pour le propriétaire). */
export async function removeMember(
  userId: string,
  shopId: string,
  targetUserId: string,
): Promise<MemberResult> {
  const access = await getRole(userId, shopId);
  if (!access || !roleHasPermission(access, "members:write")) {
    return { ok: false, reason: "Permission insuffisante (members:write)." };
  }

  const db = getDb();
  const target = await db
    .select({ role: schema.shopMembers.role })
    .from(schema.shopMembers)
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, targetUserId)))
    .limit(1);

  if (!target[0]) return { ok: false, reason: "Membre introuvable." };
  if (target[0].role === "owner")
    return { ok: false, reason: "Impossible de retirer le propriétaire." };
  if (targetUserId === userId)
    return { ok: false, reason: "Vous ne pouvez pas vous retirer vous-même." };

  await db
    .delete(schema.shopMembers)
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, targetUserId)));
  return { ok: true };
}

/** Change le rôle d'un membre (le propriétaire ne peut pas être rétrogradé). */
export async function changeMemberRole(
  userId: string,
  shopId: string,
  targetUserId: string,
  role: Role,
): Promise<MemberResult> {
  if (role === "owner") return { ok: false, reason: "Le rôle owner n'est pas attribuable." };

  const access = await getRole(userId, shopId);
  if (!access || !roleHasPermission(access, "members:write")) {
    return { ok: false, reason: "Permission insuffisante (members:write)." };
  }

  const db = getDb();
  const target = await db
    .select({ role: schema.shopMembers.role })
    .from(schema.shopMembers)
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, targetUserId)))
    .limit(1);

  if (!target[0]) return { ok: false, reason: "Membre introuvable." };
  if (target[0].role === "owner")
    return { ok: false, reason: "Impossible de modifier le propriétaire." };

  await db
    .update(schema.shopMembers)
    .set({ role })
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, targetUserId)));
  return { ok: true };
}

/** Invitations en attente d'une boutique. */
export async function listPendingInvites(shopId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.shopInvites.id,
      email: schema.shopInvites.email,
      role: schema.shopInvites.role,
      expiresAt: schema.shopInvites.expiresAt,
    })
    .from(schema.shopInvites)
    .where(eq(schema.shopInvites.shopId, shopId))
    .orderBy(sql`${schema.shopInvites.createdAt} desc`);
}

/** Accepte une invitation (usage du lien). */
export async function acceptInvite(
  token: string,
  userId: string,
): Promise<{ ok: true; shopId: string; role: string } | { ok: false; reason: string }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.shopInvites)
    .where(eq(schema.shopInvites.tokenHash, sha256Hex(token)))
    .limit(1);

  const invite = rows[0];
  if (!invite || invite.acceptedAt) return { ok: false, reason: "Invitation invalide." };
  if (invite.expiresAt.getTime() < Date.now()) return { ok: false, reason: "Invitation expirée." };

  const role = isRole(invite.role) ? invite.role : "assistant";
  await db
    .insert(schema.shopMembers)
    .values({ shopId: invite.shopId, userId, role })
    .onConflictDoNothing();
  await db
    .update(schema.shopInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.shopInvites.id, invite.id));

  return { ok: true, shopId: invite.shopId, role };
}

async function getRole(userId: string, shopId: string): Promise<Role | null> {
  const db = getDb();
  const rows = await db
    .select({ role: schema.shopMembers.role })
    .from(schema.shopMembers)
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, userId)))
    .limit(1);
  const role = rows[0]?.role;
  return role && isRole(role) ? role : null;
}
