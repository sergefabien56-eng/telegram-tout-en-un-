import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";

/**
 * Rôles et permissions (R4 — vérification côté serveur).
 * Convention : `module:action`. Le propriétaire (`owner`) a toutes les permissions.
 *
 * Les constantes et les prédicats vivent dans `@/lib/roles` (module pur, safe
 * pour le navigateur) ; ils sont ré-exportés ici par commodité.
 */
export { ROLES, ALL_PERMISSIONS, ROLE_PERMISSIONS, isRole, roleHasPermission } from "@/lib/roles";
import { ALL_PERMISSIONS, isRole, ROLE_PERMISSIONS, type Role } from "@/lib/roles";
import { isUuid } from "@/lib/ids";

export type ShopAccess = {
  shopId: string;
  role: Role;
  permissions: Set<string>;
};

/** Rôle d'un utilisateur sur une boutique (null si aucun accès). */
export async function getShopAccess(userId: string, shopId: string): Promise<ShopAccess | null> {
  // Un identifiant malformé ne peut pas désigner une boutique : on le
  // traite comme inexistant (404), jamais comme une erreur de base.
  if (!isUuid(shopId)) return null;
  const db = getDb();
  const rows = await db
    .select({ role: schema.shopMembers.role })
    .from(schema.shopMembers)
    .where(and(eq(schema.shopMembers.shopId, shopId), eq(schema.shopMembers.userId, userId)))
    .limit(1);

  const raw = rows[0]?.role;
  if (!raw || !isRole(raw)) return null;

  const permissions = new Set<string>(
    (ROLE_PERMISSIONS[raw] ?? []).includes("*") ? ALL_PERMISSIONS : (ROLE_PERMISSIONS[raw] ?? []),
  );
  return { shopId, role: raw, permissions };
}

/** Vrai si l'utilisateur a la permission sur la boutique. */
export async function can(userId: string, shopId: string, permission: string): Promise<boolean> {
  const access = await getShopAccess(userId, shopId);
  return access ? access.permissions.has(permission) : false;
}
