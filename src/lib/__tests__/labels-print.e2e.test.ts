import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { encryptText } from "@/lib/crypto";
import { normalizeOrder, upsertOrders } from "@/lib/orders";
import { normalizeOrderItem, upsertOrderItems } from "@/lib/order-items";
import { syncShopLabels } from "@/lib/labels-sync";
import { listShipmentLabels, getShipmentLabel } from "@/lib/shipment-labels";

/**
 * Chaîne d'impression **complète**, de bout en bout.
 *
 * Un serveur local rejoue le contrat officiel de `POST /orders/print-labels`
 * (HTTP 201, `success.labels[]` avec le PDF en base64, `error.orderItems[]`
 * pour les refus). Tout le reste est le **vrai** code de l'application :
 * client HTTP, lecture des articles, calcul d'éligibilité, décodage base64,
 * validation `%PDF-`, empreinte SHA-256, persistance, relecture.
 *
 * Aucun appel n'est fait chez Jumia : aucun numéro de suivi n'est attribué
 * sur un compte réel. Ce test prouve que le chemin fonctionne, pas qu'il a
 * été exercé sur la plateforme.
 */

/** PDF minimal mais valide. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);

type PrintCall = { orderItemIds: string[] };

/** Appels `print-labels` reçus par le serveur simulé. */
const appels: PrintCall[] = [];

describe("impression d'une étiquette — chaîne complète (serveur Jumia simulé)", () => {
  const hasDb = Boolean(process.env.DATABASE_URL);
  let server: Server;
  let base = "";

  const suffix = Date.now();
  const ownerEmail = `print-e2e-${suffix}@exemple.ci`;
  let ownerId = "";
  let shopId = "";
  let orderId = "";
  const ARTICLE_A = "41ea7c3b-20f0-466d-a095-e6e909298180";
  const ARTICLE_B = "c0aa1673-fd99-4f9e-a511-6cefdbdde266";

  beforeAll(async () => {
    // --- Serveur qui rejoue le contrat officiel -------------------------
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/token") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "fake-access-token",
            expires_in: 3600,
            refresh_token: "fake-refresh-token",
            refresh_expires_in: 3600,
          }),
        );
        return;
      }

      if (url.pathname === "/orders/items") {
        const orderIds = url.searchParams.getAll("orderId");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            orderIds.map((orderId) => ({
              orderId,
              orderNumber: "E2E-PRINT",
              items: [
                {
                  id: ARTICLE_A,
                  shopId: "remote-shop",
                  status: "READY_TO_SHIP",
                  trackingNumber: null,
                  trackingUrl: null,
                  shipmentType: "Own Warehouse",
                  deliveryOption: "Flat Rate",
                  isFulfilledByJumia: false,
                  itemPriceLocal: 8200,
                  paidPriceLocal: 8200,
                  shippingAmountLocal: 0,
                  country: { code: "CI", name: "Côte d'Ivoire", currencyCode: "XOF" },
                  product: { name: "Produit A", sellerSku: "SKU-A", imageUrl: "https://x/a.jpg" },
                  shippingAddress: {},
                  shippedDate: null,
                  statusDetail: null,
                },
                {
                  id: ARTICLE_B,
                  shopId: "remote-shop",
                  status: "READY_TO_SHIP",
                  trackingNumber: null,
                  trackingUrl: null,
                  shipmentType: "Own Warehouse",
                  deliveryOption: "Flat Rate",
                  isFulfilledByJumia: false,
                  itemPriceLocal: 5000,
                  paidPriceLocal: 5000,
                  shippingAmountLocal: 0,
                  country: { code: "CI", name: "Côte d'Ivoire", currencyCode: "XOF" },
                  product: { name: "Produit B", sellerSku: "SKU-B", imageUrl: "https://x/b.jpg" },
                  shippingAddress: {},
                  shippedDate: null,
                  statusDetail: null,
                },
              ],
            })),
          ),
        );
        return;
      }

      if (url.pathname === "/orders/print-labels" && req.method === "POST") {
        void handlePrint(req, res);
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;

    // Le client lit sa base **à l'import** : on la fixe avant le 1er import
    // effectif de `jumia/client.ts` (le module est chargé par le test).
    process.env.JUMIA_API_BASE = base;

    // --- Données de départ ----------------------------------------------
    const db = getDb();
    const user = (
      await db
        .insert(schema.users)
        .values({
          email: ownerEmail,
          passwordHash: await hashPassword("MotDePasse123"),
          fullName: "Test Impression",
        })
        .returning({ id: schema.users.id })
    )[0];
    ownerId = user!.id;

    const shop = (
      await db
        .insert(schema.shops)
        .values({
          ownerUserId: ownerId,
          name: "SHOP IMPRESSION TEST",
          platform: "jumia",
          externalShopId: `PRINT-${suffix}`,
          remoteShopId: "remote-shop",
          jumiaAccountId: null,
        })
        .returning({ id: schema.shops.id })
    )[0];
    shopId = shop!.id;

    // Un compte vendeur minimal, rattaché à la boutique.
    const account = (
      await db
        .insert(schema.jumiaAccounts)
        .values({
          ownerUserId: ownerId,
          label: "Compte test impression",
          clientId: "fake-client",
          refreshTokenCiphertext: encryptText("fake-refresh-token", process.env.ENCRYPTION_KEY ?? ""),
          status: "active",
        })
        .returning({ id: schema.jumiaAccounts.id })
    )[0];
    await db
      .update(schema.shops)
      .set({ jumiaAccountId: account!.id })
      .where(eq(schema.shops.id, shopId));

    const row = normalizeOrder(shopId, {
      id: "aaaaaaaa-1111-2222-3333-444444444444",
      number: `P-${suffix}`,
      status: "READY_TO_SHIP",
      totalAmountLocal: { currency: "XOF", value: 13200 },
      country: { code: "CI" },
      totalItems: 2,
      packedItems: 2,
      createdAt: "2026-11-20T10:15:00Z",
    });
    await upsertOrders([row!]);
    const order = (
      await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.externalOrderId, "aaaaaaaa-1111-2222-3333-444444444444"))
        .limit(1)
    )[0]!;
    orderId = order.id;

    await upsertOrderItems([
      normalizeOrderItem({
        shopId,
        orderId,
        raw: {
          id: ARTICLE_A,
          shopId: "remote-shop",
          status: "READY_TO_SHIP",
          trackingNumber: null,
          trackingUrl: null,
          shipmentType: "Own Warehouse",
          deliveryOption: "Flat Rate",
          isFulfilledByJumia: false,
          itemPriceLocal: 8200,
          paidPriceLocal: 8200,
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
          id: ARTICLE_B,
          shopId: "remote-shop",
          status: "READY_TO_SHIP",
          trackingNumber: null,
          trackingUrl: null,
          shipmentType: "Own Warehouse",
          deliveryOption: "Flat Rate",
          isFulfilledByJumia: false,
          itemPriceLocal: 5000,
          paidPriceLocal: 5000,
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
    await db.delete(schema.jumiaAccounts).where(eq(schema.jumiaAccounts.ownerUserId, ownerId));
    await db.delete(schema.shopMembers).where(eq(schema.shopMembers.shopId, shopId));
    await db.delete(schema.shops).where(eq(schema.shops.id, shopId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.JUMIA_API_BASE;
  });

  it.skipIf(!hasDb)("imprime, enregistre et relit l'étiquette", async () => {
    const result = await syncShopLabels({ userId: ownerId, shopId });

    expect(result.ok).toBe(true);
    // Jumia a bien reçu les deux articles éligibles.
    expect(appels).toHaveLength(1);
    expect(appels[0]?.orderItemIds).toEqual(expect.arrayContaining([ARTICLE_A, ARTICLE_B]));
    // Un colis produit, un article refusé.
    expect(result.packages).toBe(1);
    expect(result.errors).toBe(1);

    const labels = await listShipmentLabels([shopId]);
    expect(labels).toHaveLength(2);

    const disponible = labels.find((row) => row.status === "available");
    const refuse = labels.find((row) => row.status === "error");

    // L'étiquette disponible porte le PDF, son empreinte et le suivi.
    expect(disponible).toBeDefined();
    expect(disponible?.pdf?.equals(PDF)).toBe(true);
    expect(disponible?.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(disponible?.trackingNumber).toBe("JG-00D-393842527-9589");
    expect(disponible?.countryCode).toBe("CI");

    // Le refus conserve le motif exact de Jumia.
    expect(refuse).toBeDefined();
    expect(refuse?.errorCode).toBe("not_allowed_status");
    expect(refuse?.errorMessage).toContain("pending and ready to ship");
    expect(refuse?.pdf).toBeNull();

    // L'article du colis reçoit son numéro de suivi : il ne sera plus
    // proposé à l'impression.
    const db = getDb();
    const articles = await db
      .select({
        id: schema.orderItems.externalItemId,
        trackingNumber: schema.orderItems.trackingNumber,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));
    expect(articles.find((a) => a.id === ARTICLE_A)?.trackingNumber).toBe(
      "JG-00D-393842527-9589",
    );

    // Le téléchargement sert le document tel qu'il a été reçu.
    const servi = await getShipmentLabel(disponible!.id, [shopId]);
    expect(servi?.pdf?.equals(PDF)).toBe(true);
  });

  it.skipIf(!hasDb)("relancer l'impression ne crée pas de doublon", async () => {
    const result = await syncShopLabels({ userId: ownerId, shopId });
    expect(result.ok).toBe(true);

    const labels = await listShipmentLabels([shopId]);
    // Une étiquette disponible + un refus : toujours deux lignes.
    expect(labels.filter((row) => row.status === "available")).toHaveLength(1);
    expect(labels.filter((row) => row.status === "error")).toHaveLength(1);
  });
});

/** Répond à `POST /orders/print-labels` comme le fait Jumia. */
async function handlePrint(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const body = JSON.parse((await readBody(req)) || "{}") as { orderItemIds?: string[] };
  const ids = body.orderItemIds ?? [];
  appels.push({ orderItemIds: ids });

  // Réponse **partielle** : un colis produit, un article refusé.
  const [premier, ...autres] = ids;
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      success: {
        labels: premier
          ? [
              {
                orderItemIds: [premier],
                countryCode: "CI",
                trackingNumber: "JG-00D-393842527-9589",
                label: PDF.toString("base64"),
              },
            ]
          : [],
        total: premier ? 1 : 0,
      },
      error: {
        orderItems: autres.map((id) => ({
          id,
          response: {
            code: "not_allowed_status",
            message: "Only order items in pending and ready to ship status can be cancelled",
          },
        })),
        total: autres.length,
      },
    }),
  );
}

/** Lit le corps d'une requête HTTP. */
function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}
