import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { upsertOrders } from "@/lib/orders";
import { dashboardOverview } from "@/lib/dashboard";

/**
 * TABLEAU DE BORD — périmètre des données (base réelle).
 *
 * Régression ciblée : le tableau de bord agrégeait **toutes** les boutiques,
 * quel que soit le sélecteur. Changer de boutique ne changeait donc rien à
 * l'écran — le reproche le plus grave reçu sur l'application.
 *
 * Ce test crée deux boutiques avec des volumes distincts et vérifie que :
 * - le périmètre restreint ne renvoie que les données de la boutique demandée ;
 * - l'agrégat vaut la somme des deux ;
 * - une boutique non accessible ne peut pas être atteinte.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tableau de bord (base réelle)", () => {
  const suffix = Date.now();
  let userId = "";
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `dashboard-scope-${suffix}@exemple.ci`,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Test Périmètre",
      })
      .returning({ id: schema.users.id });
    userId = user?.id ?? "";

    const [a] = await db
      .insert(schema.shops)
      .values({
        name: "Boutique A",
        platform: "jumia",
        externalShopId: `DASH-A-${suffix}`,
        country: "CI",
        currency: "XOF",
        ownerUserId: userId,
      })
      .returning({ id: schema.shops.id });
    shopA = a?.id ?? "";

    const [b] = await db
      .insert(schema.shops)
      .values({
        name: "Boutique B",
        platform: "jumia",
        externalShopId: `DASH-B-${suffix}`,
        country: "CI",
        currency: "XOF",
        ownerUserId: userId,
      })
      .returning({ id: schema.shops.id });
    shopB = b?.id ?? "";

    await db.insert(schema.shopMembers).values([
      { shopId: shopA, userId, role: "owner" },
      { shopId: shopB, userId, role: "owner" },
    ]);

    // 3 commandes livrées chez A, 1 chez B : les volumes sont distincts,
    // donc une confusion de périmètre se voit immédiatement.
    await upsertOrders([
      {
        shopId: shopA,
        externalOrderId: `DASH-A-1-${suffix}`,
        orderNumber: "1",
        status: "DELIVERED",
        countryCode: "CI",
        currency: "XOF",
        totalAmountMinor: 1000,
        totalItems: 1,
        remoteCreatedAt: new Date(),
        remoteUpdatedAt: new Date(),
        raw: {},
      },
      {
        shopId: shopA,
        externalOrderId: `DASH-A-2-${suffix}`,
        orderNumber: "2",
        status: "DELIVERED",
        countryCode: "CI",
        currency: "XOF",
        totalAmountMinor: 2000,
        totalItems: 2,
        remoteCreatedAt: new Date(),
        remoteUpdatedAt: new Date(),
        raw: {},
      },
      {
        shopId: shopA,
        externalOrderId: `DASH-A-3-${suffix}`,
        orderNumber: "3",
        status: "SHIPPED",
        countryCode: "CI",
        currency: "XOF",
        totalAmountMinor: 3000,
        totalItems: 3,
        remoteCreatedAt: new Date(),
        remoteUpdatedAt: new Date(),
        raw: {},
      },
    ]);

    await upsertOrders([
      {
        shopId: shopB,
        externalOrderId: `DASH-B-1-${suffix}`,
        orderNumber: "1",
        status: "DELIVERED",
        countryCode: "CI",
        currency: "XOF",
        totalAmountMinor: 5000,
        totalItems: 5,
        remoteCreatedAt: new Date(),
        remoteUpdatedAt: new Date(),
        raw: {},
      },
    ]);
  });

  afterAll(async () => {
    if (!userId) return;
    const db = getDb();
    await db.delete(schema.orders).where(inArray(schema.orders.shopId, [shopA, shopB]));
    if (shopA) await db.delete(schema.shops).where(eq(schema.shops.id, shopA));
    if (shopB) await db.delete(schema.shops).where(eq(schema.shops.id, shopB));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("ne montre que la boutique demandée", async () => {
    const onlyA = await dashboardOverview(userId, 30, [shopA]);
    expect(onlyA.kpis.orders).toBe(3);
    expect(onlyA.kpis.revenueMinor).toBe(6000);
    expect(onlyA.kpis.units).toBe(6);
    expect(onlyA.scope.shopIds).toEqual([shopA]);
    expect(onlyA.scope.names).toEqual(["Boutique A"]);
    expect(onlyA.scope.aggregate).toBe(false);
  });

  it("change bien de chiffres quand on change de boutique", async () => {
    const onlyA = await dashboardOverview(userId, 30, [shopA]);
    const onlyB = await dashboardOverview(userId, 30, [shopB]);
    expect(onlyA.kpis.orders).not.toBe(onlyB.kpis.orders);
    expect(onlyA.kpis.revenueMinor).not.toBe(onlyB.kpis.revenueMinor);
  });

  it("agrège explicitement les deux boutiques", async () => {
    const all = await dashboardOverview(userId, 30, [shopA, shopB]);
    expect(all.kpis.orders).toBe(4);
    expect(all.kpis.revenueMinor).toBe(11000);
    expect(all.scope.aggregate).toBe(true);
    expect(all.scope.shopIds).toHaveLength(2);
  });

  it("ignore une boutique inaccessible", async () => {
    // Un identifiant inconnu ne doit jamais élargir le périmètre.
    const forged = await dashboardOverview(userId, 30, ["00000000-0000-0000-0000-000000000000"]);
    expect(forged.kpis.orders).toBe(0);
    expect(forged.scope.shopIds).toEqual([]);
  });

  it("liste les boutiques du périmètre avec leur état factuel", async () => {
    const overview = await dashboardOverview(userId, 30, [shopA, shopB]);
    expect(overview.shops).toHaveLength(2);
    expect(overview.shops.map((row) => row.name).sort()).toEqual(["Boutique A", "Boutique B"]);
    // Sans lien Jumia, l'état n'est pas « connectée » : jamais de faux vert.
    for (const shop of overview.shops) {
      expect(shop.connection.operational).toBe(false);
    }
  });

  it("produit une évolution journalière cohérente avec les totaux", async () => {
    const overview = await dashboardOverview(userId, 30, [shopA, shopB]);

    // Un point par jour de la période : la courbe ne comble aucun trou.
    expect(overview.series).toHaveLength(30);
    expect(overview.series[0]?.period).toBe(overview.period.from);
    expect(overview.series[29]?.period).toBe(overview.period.to);

    // La somme des points vaut exactement le total affiché.
    const somme = overview.series.reduce((acc, point) => acc + point.revenueMinor, 0);
    expect(somme).toBe(overview.kpis.revenueMinor);
    const commandes = overview.series.reduce((acc, point) => acc + point.orders, 0);
    expect(commandes).toBe(overview.kpis.orders);

    // Un jour sans commande vaut zéro (ce n'est pas une absence de donnée).
    const jourVide = overview.series.find((point) => point.orders === 0);
    expect(jourVide?.revenueMinor).toBe(0);
  });

  it("n'affiche que les jours de la boutique demandée", async () => {
    const onlyA = await dashboardOverview(userId, 30, [shopA]);
    const sommeA = onlyA.series.reduce((acc, point) => acc + point.revenueMinor, 0);
    expect(sommeA).toBe(onlyA.kpis.revenueMinor);

    // La boutique B n'apparaît dans aucun point de la série.
    const all = await dashboardOverview(userId, 30, [shopA, shopB]);
    const sommeAll = all.series.reduce((acc, point) => acc + point.revenueMinor, 0);
    expect(sommeAll).toBeGreaterThan(sommeA);
  });
});
