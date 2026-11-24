import { scopedShops, type ScopedShop } from "@/lib/shop-scope";

export type { ScopedShop } from "@/lib/shop-scope";

/** Périmètre « Ventes et commandes » : boutiques avec `orders:read`. */
export async function orderScope(
  userId: string,
): Promise<{ total: number; allowed: ScopedShop[] }> {
  return scopedShops(userId, "orders:read");
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
