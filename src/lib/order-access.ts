import { getShopAccess } from "@/lib/permissions";
import { listUserShops } from "@/lib/shops";

export type ScopedShop = {
  id: string;
  name: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
  currency: string;
};

/**
 * Périmètre réel des rubriques « Ventes et commandes » : uniquement les
 * boutiques dont le rôle donne `orders:read`.
 */
export async function orderScope(
  userId: string,
): Promise<{ total: number; allowed: ScopedShop[] }> {
  const all = await listUserShops(userId);
  const allowed: ScopedShop[] = [];
  for (const shop of all) {
    const access = await getShopAccess(userId, shop.id);
    if (access?.permissions.has("orders:read")) {
      allowed.push({
        id: shop.id,
        name: shop.name,
        remoteShopId: shop.remoteShopId ?? null,
        remoteShopName: shop.remoteShopName ?? null,
        currency: shop.currency ?? "XOF",
      });
    }
  }
  return { total: all.length, allowed };
}

/** Convertit un paramètre `JJ-MM-AAAA` en date UTC ; `null` si invalide. */
export function parseDay(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Boutiques retenues par le filtre « boutique », bornées au périmètre autorisé. */
export function resolveShopIds(boutique: string | undefined, allowed: ScopedShop[]): string[] {
  if (boutique && allowed.some((shop) => shop.id === boutique)) return [boutique];
  return allowed.map((shop) => shop.id);
}

export type SearchValues = {
  boutique?: string;
  du?: string;
  au?: string;
  statut?: string;
};

export function readSearchValues(
  searchParams: Record<string, string | string[] | undefined>,
): SearchValues {
  const single = (key: string) => {
    const value = searchParams[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    boutique: single("boutique"),
    du: single("du"),
    au: single("au"),
    statut: single("statut"),
  };
}
