import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { createShop } from "@/lib/shops";
import { searchUserShops } from "@/lib/search";
import { eq } from "drizzle-orm";

/** Recherche globale sur la base réelle (ignorée en CI). */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("recherche globale (base réelle)", () => {
  const suffix = Date.now();
  const email = `search-${suffix}@exemple.ci`;
  let userId = "";
  let otherId = "";
  let shopId = "";

  beforeAll(async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: hashPassword("MotDePasse123"), fullName: "Recherche Test" })
      .returning({ id: schema.users.id });
    const [other] = await db
      .insert(schema.users)
      .values({
        email: `search-other-${suffix}@exemple.ci`,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Autre Test",
      })
      .returning({ id: schema.users.id });
    if (!user || !other) throw new Error("Création des utilisateurs de test impossible.");
    userId = user.id;
    otherId = other.id;
    const shop = await createShop(userId, {
      name: `Boutique Recherche ${suffix}`,
      platform: "jumia",
      externalShopId: `SEARCH-${suffix}`,
      country: "CI",
      currency: "XOF",
    });
    shopId = shop.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.shopMembers).where(eq(schema.shopMembers.shopId, shopId));
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.users).where(eq(schema.users.id, otherId));
  });

  it("refuse les requêtes trop courtes", async () => {
    expect(await searchUserShops(userId, "a")).toEqual([]);
  });

  it("trouve une boutique par son nom", async () => {
    const results = await searchUserShops(userId, "Boutique Recherche");
    expect(results.some((shop) => shop.id === shopId)).toBe(true);
  });

  it("trouve une boutique par son identifiant externe", async () => {
    const results = await searchUserShops(userId, `SEARCH-${suffix}`);
    expect(results.some((shop) => shop.id === shopId)).toBe(true);
  });

  it("ne renvoie rien pour un terme absent", async () => {
    expect(await searchUserShops(userId, "introuvable-xyz")).toEqual([]);
  });

  it("ne expose pas la boutique d'un autre utilisateur", async () => {
    const results = await searchUserShops(otherId, "Boutique Recherche");
    expect(results).toEqual([]);
  });
});
