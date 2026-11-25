import { cookies } from "next/headers";
import { listUserShops } from "@/lib/shops";

/** Nom du cookie qui mémorise la boutique choisie par le vendeur. */
export const SHOP_COOKIE = "teu_shop";

/** Boutique courante (cookie de sélection), sinon la première accessible. */
export async function getCurrentShop(userId: string) {
  const shops = await listUserShops(userId);
  const cookieShopId = (await cookies()).get(SHOP_COOKIE)?.value;
  const shop = shops.find((row) => row.id === cookieShopId) ?? shops[0] ?? null;
  return { shop, shops };
}
