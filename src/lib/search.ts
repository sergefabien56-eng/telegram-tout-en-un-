import { getDb, schema } from "@/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";

export type ShopHit = {
  id: string;
  name: string;
  platform: string;
  externalShopId: string;
  country: string | null;
  role: string;
};

/**
 * Recherche globale — version honnête et incrémentale.
 * Seules les boutiques auxquelles l'utilisateur a accès sont parcourues ;
 * les modules pas encore implémentés (produits, commandes…) ne sont pas simulés.
 */
export async function searchUserShops(
  userId: string,
  query: string,
  limit = 8,
): Promise<ShopHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const db = getDb();
  const pattern = `%${q.replace(/[%_]/g, "")}%`;

  return db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      platform: schema.shops.platform,
      externalShopId: schema.shops.externalShopId,
      country: schema.shops.country,
      role: schema.shopMembers.role,
    })
    .from(schema.shopMembers)
    .innerJoin(schema.shops, eq(schema.shopMembers.shopId, schema.shops.id))
    .where(
      and(
        eq(schema.shopMembers.userId, userId),
        or(ilike(schema.shops.name, pattern), ilike(schema.shops.externalShopId, pattern)),
      ),
    )
    .orderBy(sql`${schema.shops.createdAt} desc`)
    .limit(limit);
}
