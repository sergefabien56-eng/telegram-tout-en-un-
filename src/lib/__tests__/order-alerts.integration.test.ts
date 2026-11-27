import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { normalizeOrder, upsertOrders } from "@/lib/orders";
import {
  computeOrderAlert,
  countUnreadOrderAlerts,
  listActiveOrderAlerts,
  markOrderAlertRead,
  readDeadlines,
  reconcileOrderAlerts,
} from "@/lib/order-alerts";

/**
 * Tests d'intégration du module d'alertes de commandes (base réelle).
 *
 * Ils couvrent les scénarios minimaux exigés :
 * - nouvelle commande détectée par la synchronisation automatique ;
 * - commande arrivée pendant l'absence du vendeur → présentée comme **non
 *   vue** à la réouverture ;
 * - alerte avant et après le seuil de 24 h ;
 * - changement de statut de la commande ;
 * - absence de doublon quand la réconciliation est rejouée ;
 * - synchronisation en panne → alerte de données incomplètes.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("alertes de commandes Jumia (base réelle)", () => {
  const suffix = Date.now();
  const ownerEmail = `alertes-${suffix}@exemple.ci`;
  let ownerId = "";
  let shopId = "";
  let autreUserId = "";
  let commandeId = "";

  const maintenant = new Date();

  beforeAll(async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.users)
      .values({
        email: ownerEmail,
        passwordHash: await hashPassword("MotDePasse123"),
        fullName: "Test Alertes",
      })
      .returning({ id: schema.users.id });
    const owner = inserted[0];
    if (!owner) throw new Error("Création utilisateur impossible.");
    ownerId = owner.id;

    const autre = await db
      .insert(schema.users)
      .values({
        email: `alertes-bis-${suffix}@exemple.ci`,
        passwordHash: await hashPassword("MotDePasse123"),
        fullName: "Test Alertes Bis",
      })
      .returning({ id: schema.users.id });
    const second = autre[0];
    if (!second) throw new Error("Création utilisateur impossible.");
    autreUserId = second.id;

    const shop = await db
      .insert(schema.shops)
      .values({
        ownerUserId: ownerId,
        name: "BOUTIQUE ALERTES TEST",
        platform: "jumia",
        externalShopId: `ALERTES-${suffix}`,
        remoteShopId: `remote-alertes-${suffix}`,
        lastSyncAt: maintenant,
        lastSyncStatus: "ok",
      })
      .returning({ id: schema.shops.id });
    const first = shop[0];
    if (!first) throw new Error("Création boutique impossible.");
    shopId = first.id;

    // Commande reçue il y a 3 heures : elle attend encore sa préparation.
    const row = normalizeOrder(shopId, {
      id: `alerte-${suffix}-1`,
      number: `A-${suffix}`,
      status: "PENDING",
      totalAmount: { currency: "XOF", value: 10000 },
      totalAmountLocal: { currency: "XOF", value: 10000 },
      country: { code: "CI" },
      shippingAddress: { firstName: "A", lastName: "B", city: "Abidjan" },
      totalItems: 2,
      packedItems: 0,
      createdAt: new Date(maintenant.getTime() - 3 * 3_600_000).toISOString(),
      updatedAt: new Date(maintenant.getTime() - 3 * 3_600_000).toISOString(),
    });
    if (!row) throw new Error("Commande de test invalide.");
    await upsertOrders([row]);

    const commandes = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopId),
          eq(schema.orders.externalOrderId, `alerte-${suffix}-1`),
        ),
      );
    const commande = commandes[0];
    if (!commande) throw new Error("Commande de test introuvable.");
    commandeId = commande.id;

    // Deux articles en attente : la commande attend sa préparation.
    await db.insert(schema.orderItems).values([
      {
        shopId,
        orderId: commandeId,
        externalItemId: `alerte-${suffix}-item-1`,
        status: "PENDING",
      },
      {
        shopId,
        orderId: commandeId,
        externalItemId: `alerte-${suffix}-item-2`,
        status: "PENDING",
      },
    ]);
  });

  it("crée une alerte pour une nouvelle commande détectée par la synchronisation", async () => {
    const resultat = await reconcileOrderAlerts({ shopIds: [shopId] });
    expect(resultat.created).toBeGreaterThanOrEqual(1);

    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    const alerte = alertes.find((row) => row.orderId === commandeId);
    expect(alerte).toBeTruthy();
    expect(alerte?.kind).toBe("nouvelle_commande");
    expect(alerte?.priority).toBe("info");
    expect(alerte?.shopName).toBe("BOUTIQUE ALERTES TEST");
    expect(alerte?.action.kind).toBe("prepare");
    expect(alerte?.action.label).toBe("Voir et préparer");
    expect(alerte?.read).toBe(false);
  });

  it("ne crée aucun doublon quand la réconciliation est rejouée", async () => {
    await reconcileOrderAlerts({ shopIds: [shopId] });
    await reconcileOrderAlerts({ shopIds: [shopId] });
    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    const pourCommande = alertes.filter((row) => row.orderId === commandeId);
    expect(pourCommande).toHaveLength(1);
  });

  it("présente comme non vue la commande reçue pendant l'absence", async () => {
    const nonVues = await countUnreadOrderAlerts({ userId: autreUserId, shopIds: [shopId] });
    expect(nonVues).toBeGreaterThanOrEqual(1);

    // La lecture est personnelle : un utilisateur qui a vu l'alerte n'a pas
    // pour autant signalé l'autre.
    const avant = await listActiveOrderAlerts({ userId: autreUserId, shopIds: [shopId] });
    const alerteAvant = avant.find((row) => row.orderId === commandeId);
    expect(alerteAvant).toBeTruthy();
    if (!alerteAvant) throw new Error("Alerte introuvable.");

    await markOrderAlertRead({ userId: autreUserId, alertId: alerteAvant.id });
    const alertes = await listActiveOrderAlerts({ userId: autreUserId, shopIds: [shopId] });
    const alerte = alertes.find((row) => row.orderId === commandeId);
    expect(alerte?.read).toBe(true);

    const nonVuesBis = await countUnreadOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    expect(nonVuesBis).toBeGreaterThanOrEqual(1);
  });

  it("renforce l'alerte quand le seuil de 24 h est dépassé", async () => {
    const db = getDb();
    // La commande passe à 30 h : au-delà du seuil préventif.
    await db
      .update(schema.orders)
      .set({ remoteCreatedAt: new Date(maintenant.getTime() - 30 * 3_600_000) })
      .where(eq(schema.orders.id, commandeId));

    await reconcileOrderAlerts({ shopIds: [shopId] });
    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    const alerte = alertes.find((row) => row.orderId === commandeId);
    expect(alerte?.kind).toBe("delai_24h");
    expect(alerte?.priority).toBe("critical");
    // L'alerte renforcée redevient non vue : la situation s'est aggravée.
    expect(alerte?.read).toBe(false);
  });

  it("résout l'alerte quand la commande ne justifie plus l'alerte", async () => {
    const db = getDb();
    await db
      .update(schema.orders)
      .set({ status: "DELIVERED", packedItems: 2 })
      .where(eq(schema.orders.id, commandeId));
    await db
      .update(schema.orderItems)
      .set({ status: "DELIVERED" })
      .where(eq(schema.orderItems.orderId, commandeId));

    await reconcileOrderAlerts({ shopIds: [shopId] });
    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    expect(alertes.find((row) => row.orderId === commandeId)).toBeUndefined();

    const resolues = await db
      .select()
      .from(schema.orderAlerts)
      .where(
        and(
          eq(schema.orderAlerts.shopId, shopId),
          eq(schema.orderAlerts.orderId, commandeId),
          eq(schema.orderAlerts.status, "resolved"),
        ),
      );
    expect(resolues).toHaveLength(1);
    expect(resolues[0]?.resolution).toContain("livrée");
  });

  it("signale une synchronisation en panne et la résout au retour", async () => {
    const db = getDb();
    await db
      .update(schema.shops)
      .set({ lastSyncStatus: "error", lastSyncAt: maintenant })
      .where(eq(schema.shops.id, shopId));

    await reconcileOrderAlerts({ shopIds: [shopId] });
    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    const alerte = alertes.find((row) => row.kind === "synchronisation");
    expect(alerte).toBeTruthy();
    expect(alerte?.priority).toBe("critical");
    expect(alerte?.action.kind).toBe("sync");

    await db
      .update(schema.shops)
      .set({ lastSyncStatus: "ok", lastSyncAt: new Date() })
      .where(eq(schema.shops.id, shopId));
    await reconcileOrderAlerts({ shopIds: [shopId] });
    const apres = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    expect(apres.find((row) => row.kind === "synchronisation")).toBeUndefined();
  });

  it("applique un seuil propre à la boutique", async () => {
    const db = getDb();
    await db
      .insert(schema.appSettings)
      .values({
        key: `alertes.delai_preventif_heures.${shopId}`,
        value: { heures: 48 },
      })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value: { heures: 48 } },
      });

    const seuils = await readDeadlines([shopId]);
    expect(seuils.get(shopId)).toBe(48);

    // Une commande de 30 h n'est donc pas encore « en retard » avec ce seuil.
    const alerte = computeOrderAlert({
      now: maintenant,
      shopName: "BOUTIQUE ALERTES TEST",
      orderNumber: "A-1",
      externalOrderId: "A-1",
      remoteCreatedAt: new Date(maintenant.getTime() - 30 * 3_600_000),
      firstSeenAt: new Date(maintenant.getTime() - 30 * 3_600_000),
      deadlineHours: seuils.get(shopId),
    });
    expect(alerte.kind).toBe("nouvelle_commande");
    expect(alerte.priority).toBe("warning");
  });

  it("n'alerte pas une commande dont tous les articles sont clos", async () => {
    const db = getDb();
    // Commande « Multiple Status » : un article livré, un annulé. Il ne
    // reste rien à préparer : aucune alerte ne doit être produite.
    const row = normalizeOrder(shopId, {
      id: `alerte-${suffix}-2`,
      number: `A2-${suffix}`,
      status: "Multiple Status",
      hasMultipleStatus: true,
      totalAmount: { currency: "XOF", value: 10000 },
      totalAmountLocal: { currency: "XOF", value: 10000 },
      country: { code: "CI" },
      shippingAddress: { firstName: "C", lastName: "D", city: "Abidjan" },
      totalItems: 2,
      packedItems: 1,
      createdAt: new Date(maintenant.getTime() - 5 * 3_600_000).toISOString(),
      updatedAt: new Date(maintenant.getTime() - 5 * 3_600_000).toISOString(),
    });
    if (!row) throw new Error("Commande de test invalide.");
    await upsertOrders([row]);

    const commandes = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopId),
          eq(schema.orders.externalOrderId, `alerte-${suffix}-2`),
        ),
      );
    const commande = commandes[0];
    if (!commande) throw new Error("Commande de test introuvable.");
    await db.insert(schema.orderItems).values([
      {
        shopId,
        orderId: commande.id,
        externalItemId: `alerte-${suffix}-2-item-1`,
        status: "CANCELED",
      },
      {
        shopId,
        orderId: commande.id,
        externalItemId: `alerte-${suffix}-2-item-2`,
        status: "DELIVERED",
      },
    ]);

    await reconcileOrderAlerts({ shopIds: [shopId] });
    const alertes = await listActiveOrderAlerts({ userId: ownerId, shopIds: [shopId] });
    expect(alertes.find((row) => row.orderId === commande.id)).toBeUndefined();
  });

  it("nettoie ses données de test", async () => {
    const db = getDb();
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    await db.delete(schema.users).where(eq(schema.users.id, autreUserId));
  });
});
