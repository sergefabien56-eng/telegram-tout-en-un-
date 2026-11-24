/**
 * Rôles et permissions (R4) — partie **pure**, importable depuis le navigateur.
 *
 * La vérification reste appliquée côté serveur ; ce module ne contient que des
 * constantes et des prédicats, sans accès à la base. Ne rien ajouter qui importe
 * `@/db` ici : la page Boutiques est un composant client.
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
