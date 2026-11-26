import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { listItemStatusesByOrder } from "@/lib/order-items";
import { hashPassword } from "@/lib/password";
import {
  countOrdersForShops,
  listOrderCities,
  listOrdersForShops,
  normalizeOrder,
  upsertOrders,
} from "@/lib/orders";
import { orderFamily } from "@/lib/order-status";

/**
 * Tests d'intégration des vues « commandes » sur la base réelle.
 *
 * Ils vérifient les **définitions** des compteurs (nombre de commandes,
 * total affiché) et de l'agrégat géographique, en s'appuyant sur des
 * commandes au statut et à la ville choisis : aucune valeur n'est codée en
 * dur dans l'interface, tout vient de la base.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("vues commandes : compteurs et agrégats (base réelle)", () => {
  const suffix = Date.now();
  const ownerEmail = `ventes-${suffix}@exemple.ci`;
  let ownerId = "";
  let shopId = "";
  const autreShopId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

  const base = {
    id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    country: { code: "CI" },
    isPrepayment: false,
    hasMultipleStatus: false,
    deliveryOption: "Flat Rate",
    createdAt: "2026-11-10T10:00:00Z",
    updatedAt: "2026-11-11T10:00:00Z",
  };

  const commandes = [
    {
      ...base,
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaa0001",
      number: `T1-${suffix}`,
      status: "PENDING",
      totalAmount: { currency: "XOF", value: 10000 },
      totalAmountLocal: { currency: "XOF", value: 10000 },
      shippingAddress: { firstName: "A", lastName: "B", city: "Abidjan" },
      totalItems: 2,
      packedItems: 0,
    },
    {
      ...base,
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaa0002",
      number: `T2-${suffix}`,
      status: "READY_TO_SHIP",
      totalAmount: { currency: "XOF", value: 20000 },
      totalAmountLocal: { currency: "XOF", value: 20000 },
      shippingAddress: { firstName: "C", lastName: "D", city: "Abidjan" },
      totalItems: 1,
      packedItems: 1,
    },
    {
      ...base,
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaa0003",
      number: `T3-${suffix}`,
      status: "SHIPPED",
      totalAmount: { currency: "XOF", value: 30000 },
      totalAmountLocal: { currency: "XOF", value: 30000 },
      shippingAddress: { firstName: "E", lastName: "F", city: "Bouaké" },
      totalItems: 1,
      packedItems: 1,
    },
    {
      ...base,
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaa0004",
      number: `T4-${suffix}`,
      status: "CANCELED",
      totalAmount: { currency: "XOF", value: 40000 },
      totalAmountLocal: { currency: "XOF", value: 40000 },
      shippingAddress: { firstName: "G", lastName: "H", city: "Bouaké" },
      totalItems: 1,
      packedItems: 0,
    },
    // Cas réel (MaxiShopsCI, commande 325542321) : statut agrégé « Multiple
    // Status », 2 articles dont un seul emballé. Les statuts d'articles
    // disent qu'un article a été annulé et l'autre livré : il ne reste rien
    // à préparer, la commande ne doit donc **pas** apparaître dans
    // « À traiter ».
    {
      ...base,
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaa0005",
      number: `T5-${suffix}`,
      status: "Multiple Status",
      hasMultipleStatus: true,
      totalAmount: { currency: "XOF", value: 50000 },
      totalAmountLocal: { currency: "XOF", value: 50000 },
      shippingAddress: { firstName: "I", lastName: "J", city: "Abidjan" },
      totalItems: 2,
      packedItems: 1,
    },
  ];

  beforeAll(async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.users)
      .values({
        email: ownerEmail,
        passwordHash: await hashPassword("MotDePasse123"),
        fullName: "Test Ventes",
      })
      .returning({ id: schema.users.id });
    const firstUser = inserted[0];
    if (!firstUser) throw new Error("Création utilisateur impossible.");
    ownerId = firstUser.id;
    const shop = await db
      .insert(schema.shops)
      .values({
        ownerUserId: ownerId,
        name: "SHOP VENTES TEST",
        platform: "jumia",
        externalShopId: `VENTES-${suffix}`,
        remoteShopId: `remote-ventes-${suffix}`,
      })
      .returning({ id: schema.shops.id });
    const firstShop = shop[0];
    if (!firstShop) throw new Error("Création boutique impossible.");
    shopId = firstShop.id;

    const rows = commandes.flatMap((raw) => {
      const row = normalizeOrder(shopId, raw);
      return row ? [row] : [];
    });
    await upsertOrders(rows);

    // Articles de la commande « Multiple Status » : un annulé, un livré.
    // C'est le niveau qui dit ce qu'il reste à faire.
    const multi = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopId),
          eq(schema.orders.externalOrderId, "aaaaaaaa-1111-4111-8111-aaaaaaaa0005"),
        ),
      );
    const multiId = multi[0]?.id;
    if (multiId) {
      await db.insert(schema.orderItems).values([
        {
          shopId,
          orderId: multiId,
          externalItemId: `T5-${suffix}-item-1`,
          status: "CANCELED",
        },
        {
          shopId,
          orderId: multiId,
          externalItemId: `T5-${suffix}-item-2`,
          status: "DELIVERED",
          trackingNumber: `T5-${suffix}-suivi`,
          shippedDate: new Date("2026-11-07T17:11:38Z"),
        },
      ]);
    }
  });

  it("compte les commandes du périmètre et la somme de leurs montants", async () => {
    const compteurs = await countOrdersForShops([shopId], {});
    expect(compteurs.orders).toBe(5);
    expect(compteurs.totalMinor).toBe(10000 + 20000 + 30000 + 40000 + 50000);
    expect(compteurs.currencies).toEqual(["XOF"]);
  });

  it("applique le filtre de statut : le compteur suit la sélection", async () => {
    const compteurs = await countOrdersForShops([shopId], { status: "CANCELED" });
    expect(compteurs.orders).toBe(1);
    expect(compteurs.totalMinor).toBe(40000);
  });

  it("applique le filtre de période", async () => {
    const horsPeriode = await countOrdersForShops([shopId], {
      from: new Date("2030-01-01T00:00:00Z"),
    });
    expect(horsPeriode.orders).toBe(0);
    expect(horsPeriode.totalMinor).toBe(0);
  });

  it("agrège par localité avec les effectifs qui justifient les taux", async () => {
    const villes = await listOrderCities([shopId], {});
    const abidjan = villes.find((ville) => ville.city === "Abidjan");
    const bouake = villes.find((ville) => ville.city === "Bouaké");
    expect(abidjan?.orders).toBe(3);
    expect(abidjan?.canceled).toBe(0);
    expect(abidjan?.failed).toBe(0);
    // T5 (multi-statuts : un article annulé, un livré) compte comme livrée.
    expect(abidjan?.delivered).toBe(1);
    expect(abidjan?.totalMinor).toBe(30000 + 50000);
    expect(bouake?.orders).toBe(2);
    expect(bouake?.canceled).toBe(1);
    expect(bouake?.totalMinor).toBe(70000);
    // L'effectif est disponible : un taux seul ne pourrait pas être vérifié.
    expect(abidjan?.orders).toBeGreaterThan(0);
  });

  it("sépare les familles de commandes comme le fait l'interface", async () => {
    const rows = await listOrdersForShops([shopId], { limit: 50 });
    const statutsArticles = await listItemStatusesByOrder(
      [shopId],
      rows.map(({ order }) => order.id),
    );
    const familles = rows.map(({ order }) =>
      orderFamily({
        status: order.status,
        packedItems: order.packedItems,
        totalItems: order.totalItems,
        itemStatuses: statutsArticles.get(order.id) ?? [],
      }),
    );
    expect(familles.filter((famille) => famille === "en-attente")).toHaveLength(1);
    expect(familles.filter((famille) => famille === "pretes-a-expedier")).toHaveLength(1);
    expect(familles.filter((famille) => famille === "expediees")).toHaveLength(1);
    expect(familles.filter((famille) => famille === "annulees")).toHaveLength(1);
    // La commande multi-statuts dont tous les articles sont clos est
    // livrée, pas « à traiter ».
    expect(familles.filter((famille) => famille === "livrees")).toHaveLength(1);
  });

  it("ne présente pas en « à traiter » une commande dont tous les articles sont clos", async () => {
    // Régression : la commande 325542321 (MaxiShopsCI) affichait « en
    // attente » alors qu'un article avait été annulé et l'autre livré.
    // Le statut agrégé « Multiple Status » et le compteur `packedItems`
    // ne disent rien de ce qu'il reste à faire : seuls les articles le
    // disent.
    const enAttente = await countOrdersForShops([shopId], { family: "en-attente" });
    expect(enAttente.orders).toBe(1);
    const listees = await listOrdersForShops([shopId], { family: "en-attente", limit: 50 });
    expect(listees.map(({ order }) => order.status)).not.toContain("Multiple Status");

    const livrees = await listOrdersForShops([shopId], { family: "livrees", limit: 50 });
    expect(livrees.map(({ order }) => order.status)).toContain("Multiple Status");
  });

  it("restreint les compteurs à une famille de commandes", async () => {
    // Le compteur doit décrire exactement ce que la page affiche : la
    // somme des montants reste celle des commandes listées.
    const toutes = await countOrdersForShops([shopId], {});
    const annulees = await countOrdersForShops(
      [shopId],
      {},
      (order) => order.family === "annulees",
    );
    expect(annulees.orders).toBe(1);
    expect(annulees.totalMinor).toBe(40000);
    expect(annulees.totalMinor).toBeLessThan(toutes.totalMinor);
    // Un filtre de famille ne change pas le périmètre des filtres.
    const parStatut = await countOrdersForShops(
      [shopId],
      { status: "CANCELED" },
      (order) => order.family === "annulees",
    );
    expect(parStatut.orders).toBe(1);
  });

  it("classe en SQL exactement comme la classification JS", async () => {
    // La liste affichée (filtre en base) et le compteur (définition JS) ne
    // doivent jamais diverger.
    for (const famille of [
      "annulees",
      "echec-livraison",
      "retours",
      "livrees",
      "expediees",
      "en-attente",
      "pretes-a-expedier",
      "hors-annulees",
    ] as const) {
      const enBase = await listOrdersForShops([shopId], { family: famille, limit: 50 });
      const enJs = await listOrdersForShops([shopId], { limit: 50 });
      const statutsArticles = await listItemStatusesByOrder(
        [shopId],
        enJs.map(({ order }) => order.id),
      );
      const attendu = enJs
        .filter(({ order }) => {
          const familleJs = orderFamily({
            status: order.status,
            packedItems: order.packedItems,
            totalItems: order.totalItems,
            itemStatuses: statutsArticles.get(order.id) ?? [],
          });
          return famille === "hors-annulees" ? familleJs !== "annulees" : familleJs === famille;
        })
        .map(({ order }) => order.id)
        .sort();
      const obtenu = enBase.map(({ order }) => order.id).sort();
      expect(obtenu, `famille ${famille}`).toEqual(attendu);
    }
  });

  it("ne renvoie rien pour une boutique hors périmètre", async () => {
    const compteurs = await countOrdersForShops([autreShopId], {});
    expect(compteurs.orders).toBe(0);
    const villes = await listOrderCities([autreShopId], {});
    expect(villes).toHaveLength(0);
  });

  it("nettoie ses données de test", async () => {
    const db = getDb();
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
  });
});
