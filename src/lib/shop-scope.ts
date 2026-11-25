import { cookies } from "next/headers";
import { getShopAccess } from "@/lib/permissions";
import { listUserShops } from "@/lib/shops";
import { SHOP_COOKIE } from "@/lib/current-shop";

export type ScopedShop = {
  id: string;
  name: string;
  platform: string;
  country: string | null;
  currency: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
  remoteLinkedAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
};

/**
 * Boutiques accessibles à l'utilisateur pour une permission donnée.
 * Le périmètre vient toujours de la base : jamais de saisie libre.
 */
export async function scopedShops(
  userId: string,
  permission: string,
): Promise<{ total: number; allowed: ScopedShop[]; currentShopId: string | null }> {
  const all = await listUserShops(userId);
  const allowed: ScopedShop[] = [];
  for (const shop of all) {
    const access = await getShopAccess(userId, shop.id);
    if (!access?.permissions.has(permission)) continue;
    allowed.push({
      id: shop.id,
      name: shop.name,
      platform: shop.platform,
      country: shop.country ?? null,
      currency: shop.currency ?? "XOF",
      remoteShopId: shop.remoteShopId ?? null,
      remoteShopName: shop.remoteShopName ?? null,
      remoteLinkedAt: shop.remoteLinkedAt ?? null,
      lastSyncAt: shop.lastSyncAt ?? null,
      lastSyncStatus: shop.lastSyncStatus ?? null,
    });
  }
  // Boutique courante (cookie `teu_shop`) si elle est accessible avec cette
  // permission, sinon la première autorisée. Elle sert de périmètre par
  // défaut : sans filtre explicite, on ne montre qu'une boutique.
  const cookieShopId = (await cookies()).get(SHOP_COOKIE)?.value ?? null;
  const currentShopId =
    allowed.find((shop) => shop.id === cookieShopId)?.id ?? allowed[0]?.id ?? null;

  return { total: all.length, allowed, currentShopId };
}
