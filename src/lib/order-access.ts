import { scopedShops, type ScopedShop } from "@/lib/shop-scope";

export type { ScopedShop } from "@/lib/shop-scope";

/** Périmètre « Ventes et commandes » : boutiques avec `orders:read`. */
export async function orderScope(
  userId: string,
): Promise<{ total: number; allowed: ScopedShop[]; currentShopId: string | null }> {
  return scopedShops(userId, "orders:read");
}

/** Convertit un paramètre `JJ-MM-AAAA` en date UTC ; `null` si invalide. */
export function parseDay(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Valeur explicite du filtre « toutes les boutiques ». */
export const ALL_SHOPS = "toutes";

/**
 * Boutiques retenues par le filtre « boutique ».
 *
 * Règles d'isolation :
 * 1. une boutique demandée **et autorisée** → cette boutique seule ;
 * 2. une boutique demandée **mais non autorisée** → périmètre **vide** :
 *    un paramètre d'URL ne doit jamais élargir le périmètre ;
 * 3. aucun filtre → la **boutique courante** (celle choisie dans l'en-tête) ;
 * 4. `toutes` → agrégat explicite sur les boutiques autorisées.
 */
export function resolveShopIds(
  boutique: string | undefined,
  allowed: ScopedShop[],
  currentShopId?: string | null,
): string[] {
  const ids = allowed.map((shop) => shop.id);
  if (boutique === ALL_SHOPS) return ids;
  if (boutique) return ids.includes(boutique) ? [boutique] : [];
  if (currentShopId && ids.includes(currentShopId)) return [currentShopId];
  return ids;
}

/**
 * `true` quand une boutique a été demandée mais n'est pas dans le périmètre
 * autorisé. L'interface doit alors le dire explicitement : un tableau vide
 * serait trompeur (il laisserait croire à « aucune donnée »).
 */
export function isRefusedScope(values: SearchValues, shopIds: string[]): boolean {
  return Boolean(values.boutique) && values.boutique !== ALL_SHOPS && shopIds.length === 0;
}

export type SearchValues = {
  boutique?: string;
  du?: string;
  au?: string;
  statut?: string;
  /** Durée de la période d'analyse (tableau de bord, performances). */
  days?: string;
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
    days: single("days"),
  };
}
