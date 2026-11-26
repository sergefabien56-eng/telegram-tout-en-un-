import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { normalizeOrder, upsertOrders } from "@/lib/orders";
import { normalizeOrderItem, upsertOrderItems } from "@/lib/order-items";
import {
  clearSupersededLabels,
  countShipmentLabelsByStatus,
  getShipmentLabel,
  listShipmentLabels,
  upsertAvailableLabel,
  upsertErrorLabel,
  upsertPendingLabel,
} from "@/lib/shipment-labels";

/**
 * Tests d'intégration des étiquettes sur la base réelle (ignorés en CI).
 *
 * Ils vérifient les trois états finaux — disponible, pas encore disponible,
 * erreur Jumia — et l'idempotence de l'enregistrement.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");

describe.skipIf(!hasDb)("étiquettes d'expédition (base réelle)", () => {
  const suffix = Date.now();
  const ownerEmail = `etiquettes-${suffix}@exemple.ci`;
  let ownerId = "";
  let shopId = "";
  let orderId = "";
  const articleA = "41ea7c3b-20f0-466d-a095-e6e909298180";
  const articleB = "c0aa1673-fd99-4f9e-a511-6cefdbdde266";

  beforeAll(async () => {
    const db = getDb();
    const user = (
      await db
        .insert(schema.users)
        .values({
          email: ownerEmail,
          passwordHash: await hashPassword("MotDePasse123"),
          fullName: "Test Étiquettes",
        })
        .returning({ id: schema.users.id })
    )[0];
    if (!user) throw new Error("Création utilisateur impossible.");
    ownerId = user.id;

    const shop = (
      await db
        .insert(schema.shops)
        .values({
          ownerUserId: ownerId,
          name: "SHOP ÉTIQUETTES TEST",
          platform: "jumia",
          externalShopId: `ETIQ-${suffix}`,
          remoteShopId: `remote-etiq-${suffix}`,
        })
        .returning({ id: schema.shops.id })
    )[0];
    if (!shop) throw new Error("Création boutique impossible.");
    shopId = shop.id;

    const row = normalizeOrder(shopId, {
      id: "41ea7c3b-20f0-466d-a095-e6e909298180",
      number: `E-${suffix}`,
      status: "READY_TO_SHIP",
      totalAmountLocal: { currency: "XOF", value: 8200 },
      country: { code: "CI" },
      totalItems: 2,
      packedItems: 2,
      createdAt: "2026-11-20T10:15:00Z",
    });
    await upsertOrders([row!]);
    const stored = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, shopId))
      .limit(1);
    orderId = stored[0]!.id;

    await upsertOrderItems([
      normalizeOrderItem({
        shopId,
        orderId,
        raw: {
          id: articleA,
          shopId: `remote-etiq-${suffix}`,
          status: "READY_TO_SHIP",
          trackingNumber: null,
          trackingUrl: null,
          shipmentType: "Own Warehouse",
          deliveryOption: "Flat Rate",
          isFulfilledByJumia: false,
          itemPriceLocal: 4100,
          paidPriceLocal: 4100,
          shippingAmountLocal: 0,
          countryCode: "CI",
          currency: "XOF",
          productName: "Produit A",
          sellerSku: "SKU-A",
          productImageUrl: null,
          shippedDate: null,
        },
      }),
      normalizeOrderItem({
        shopId,
        orderId,
        raw: {
          id: articleB,
          shopId: `remote-etiq-${suffix}`,
          status: "READY_TO_SHIP",
          trackingNumber: null,
          trackingUrl: null,
          shipmentType: "Own Warehouse",
          deliveryOption: "Flat Rate",
          isFulfilledByJumia: false,
          itemPriceLocal: 4100,
          paidPriceLocal: 4100,
          shippingAmountLocal: 0,
          countryCode: "CI",
          currency: "XOF",
          productName: "Produit B",
          sellerSku: "SKU-B",
          productImageUrl: null,
          shippedDate: null,
        },
      }),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.shipmentLabels).where(eq(schema.shipmentLabels.shopId, shopId));
    await db.delete(schema.orderItems).where(eq(schema.orderItems.shopId, shopId));
    await db.delete(schema.orders).where(eq(schema.orders.shopId, shopId));
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
  });

  it("enregistre une étiquette disponible et la relit à l'identique", async () => {
    await upsertAvailableLabel({
      shopId,
      orderId,
      orderItemIds: [articleA],
      countryCode: "CI",
      trackingNumber: "JG-00D-1",
      pdf: PDF,
      pdfSha256: "abc123",
      pdfSize: PDF.length,
    });

    const rows = await listShipmentLabels([shopId], { status: ["available"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pdf?.equals(PDF)).toBe(true);
    expect(rows[0]?.trackingNumber).toBe("JG-00D-1");
    expect(rows[0]?.orderNumber).toBe(`E-${suffix}`);
  });

  it("ne duplique pas l'étiquette d'un même colis", async () => {
    await upsertAvailableLabel({
      shopId,
      orderId,
      orderItemIds: [articleA],
      countryCode: "CI",
      trackingNumber: "JG-00D-1",
      pdf: PDF,
      pdfSha256: "abc123",
      pdfSize: PDF.length,
    });
    const rows = await listShipmentLabels([shopId], { status: ["available"] });
    expect(rows).toHaveLength(1);
  });

  it("distingue les trois états finaux", async () => {
    await upsertPendingLabel({
      shopId,
      orderId,
      orderItemIds: [articleB],
      errorMessage: "Document pas encore disponible.",
    });
    await upsertErrorLabel({
      shopId,
      orderId,
      orderItemId: articleB,
      errorCode: "not_allowed_status",
      errorMessage: "Statut non autorisé",
    });

    const compteurs = await countShipmentLabelsByStatus([shopId]);
    expect(compteurs.available).toBe(1);
    expect(compteurs.error).toBe(1);
    // L'état « en attente » du même article est superseded par l'erreur.
    expect(compteurs.pending).toBe(0);
  });

  it("efface l'erreur quand l'article finit par réussir", async () => {
    await upsertAvailableLabel({
      shopId,
      orderId,
      orderItemIds: [articleB],
      countryCode: "CI",
      trackingNumber: "JG-00D-2",
      pdf: PDF,
      pdfSha256: "def456",
      pdfSize: PDF.length,
    });
    await clearSupersededLabels({ shopId, orderId, itemIds: [articleB] });

    const compteurs = await countShipmentLabelsByStatus([shopId]);
    expect(compteurs.available).toBe(2);
    expect(compteurs.error).toBe(0);
  });

  it("ne sert jamais une étiquette d'une boutique hors périmètre", async () => {
    const rows = await listShipmentLabels([shopId], { status: ["available"] });
    const labelId = rows[0]!.id;

    expect(await getShipmentLabel(labelId, [shopId])).not.toBeNull();
    expect(await getShipmentLabel(labelId, ["autre-boutique"])).toBeNull();
    expect(await getShipmentLabel(labelId, [])).toBeNull();
  });
});
