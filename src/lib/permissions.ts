import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";

/**
 * Rôles et permissions (R4 — vérification côté serveur).
 * Convention : `module:action`. Le propriétaire (`owner`) a toutes les permissions.
 */
export const ROLES = ["owner", "manager", "stock", "accountant", "assistant"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS = [
  "shops:read",
  "shops:write",
  "orders:read",
  "orders:write",
  "products:read",
  "products:write",
  "inventory:read",
  "inventory:write",
  "finance:read",
  "finance:write",
  "reports:read",
  "members:read",
  "members:write",
  "admin:read",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number] | "*";

const MANAGER: Permission[] = [
  "shops:read",
  "shops:write",
  "orders:read",
  "orders:write",
  "products:read",
  "products:write",
  "inventory:read",
  "inventory:write",
  "finance:read",
  "reports:read",
  "members:read",
  "members:write",
  "admin:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ["*"],
  manager: MANAGER,
  stock: ["orders:read", "products:read", "inventory:read", "inventory:write"],
  accountant: ["orders:read", "finance:read", "finance:write", "reports:read"],
  assistant: ["orders:read", "inventory:read"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function roleHasPermission(role: Role, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission as Permission);
}

export type ShopAccess = {
  shopId: string;
  role: Role;
  permissions: Set<string>;
};

/** Rôle d'un utilisateur sur une boutique (null si aucun accès). */
export async function getShopAccess(userId: string, shopId: string): Promise<ShopAccess | null> {
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
