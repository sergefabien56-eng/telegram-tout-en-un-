import { describe, expect, it } from "vitest";
import {
  decodeLabelPdf,
  itemErrorKey,
  packageKey,
} from "@/lib/shipment-labels";
import { normalizeJumiaOrderItem } from "@/lib/jumia/order-items";
import { normalizeOrderItem } from "@/lib/order-items";
import { sha256HexOfBytes } from "@/lib/crypto";

/**
 * Étiquettes d'expédition — le document n'est accepted comme *disponible*
 * qu'après décodage, vérification de la signature PDF et calcul de son
 * empreinte. Les clés doivent rendre l'opération idempotente.
 */

const BOUTIQUE = "11111111-1111-1111-1111-111111111111";
const AUTRE_BOUTIQUE = "22222222-2222-2222-2222-222222222222";
const COMMANDE = "33333333-3333-3333-3333-333333333333";
const ARTICLE_A = "41ea7c3b-20f0-466d-a095-e6e909298180";
const ARTICLE_B = "c0aa1673-fd99-4f9e-a511-6cefdbdde266";

/** PDF minimal, suffisant pour la validation. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");

describe("clé d'idempotence du colis", () => {
  it("ne dépend pas de l'ordre des articles", () => {
    expect(packageKey(BOUTIQUE, COMMANDE, [ARTICLE_A, ARTICLE_B])).toBe(
      packageKey(BOUTIQUE, COMMANDE, [ARTICLE_B, ARTICLE_A]),
    );
  });

  it("change si la boutique, la commande ou les articles changent", () => {
    const base = packageKey(BOUTIQUE, COMMANDE, [ARTICLE_A, ARTICLE_B]);
    expect(packageKey(AUTRE_BOUTIQUE, COMMANDE, [ARTICLE_A, ARTICLE_B])).not.toBe(base);
    expect(packageKey(BOUTIQUE, "autre", [ARTICLE_A, ARTICLE_B])).not.toBe(base);
    expect(packageKey(BOUTIQUE, COMMANDE, [ARTICLE_A])).not.toBe(base);
  });

  it("ne confond jamais un colis et un article refusé", () => {
    expect(itemErrorKey(BOUTIQUE, COMMANDE, ARTICLE_A)).not.toBe(
      packageKey(BOUTIQUE, COMMANDE, [ARTICLE_A]),
    );
  });
});

describe("décodage du PDF d'étiquette", () => {
  it("accepte un PDF et calcule son empreinte", () => {
    const decoded = decodeLabelPdf(PDF.toString("base64"));
    expect(decoded).not.toBeNull();
    expect(decoded?.pdf.equals(PDF)).toBe(true);
    expect(decoded?.size).toBe(PDF.length);
    expect(decoded?.sha256).toBe(sha256HexOfBytes(PDF));
  });

  it("refuse un document qui n'est pas un PDF", () => {
    const faux = Buffer.from("Ceci n'est pas un PDF", "latin1");
    expect(decodeLabelPdf(faux.toString("base64"))).toBeNull();
  });

  it("refuse une charge utile qui n'est pas du base64", () => {
    expect(decodeLabelPdf("pas du base64 ***")).toBeNull();
    expect(decodeLabelPdf("")).toBeNull();
    expect(decodeLabelPdf("   ")).toBeNull();
  });

  it("refuse une longueur base64 incomplète", () => {
    expect(decodeLabelPdf("QUJDREVGRw")).toBeNull();
  });
});

describe("normalisation d'un article Jumia", () => {
  it("lit les champs utiles et rejette un article incomplet", () => {
    const item = normalizeJumiaOrderItem({
      id: ARTICLE_A,
      shopId: "boutique-distante",
      status: "READY_TO_SHIP",
      trackingNumber: null,
      trackingUrl: null,
      shipmentType: "Own Warehouse",
      deliveryOption: "Flat Rate",
      isFulfilledByJumia: false,
      itemPriceLocal: 16800,
      paidPriceLocal: 15600,
      shippingAmountLocal: 2000,
      country: { code: "CI", currencyCode: "XOF" },
      product: { name: "Sac à main", sellerSku: "SKU-1", imageUrl: "https://exemple/i.jpg" },
      shippedDate: null,
    });

    expect(item?.id).toBe(ARTICLE_A);
    expect(item?.status).toBe("READY_TO_SHIP");
    expect(item?.countryCode).toBe("CI");
    expect(item?.currency).toBe("XOF");
    expect(item?.sellerSku).toBe("SKU-1");
    expect(item?.trackingNumber).toBeNull();

    expect(normalizeJumiaOrderItem({ status: "READY_TO_SHIP" })).toBeNull();
    expect(normalizeJumiaOrderItem({ id: ARTICLE_A })).toBeNull();
  });
});

describe("normalisation d'un article vers la base", () => {
  it("convertit les montants locaux en unités mineures", () => {
    const row = normalizeOrderItem({
      shopId: BOUTIQUE,
      orderId: COMMANDE,
      raw: {
        id: ARTICLE_A,
        shopId: "boutique-distante",
        status: "READY_TO_SHIP",
        trackingNumber: null,
        trackingUrl: null,
        shipmentType: "Own Warehouse",
        deliveryOption: "Flat Rate",
        isFulfilledByJumia: false,
        itemPriceLocal: 16800,
        paidPriceLocal: 15600,
        shippingAmountLocal: 2000,
        countryCode: "CI",
        currency: "XOF",
        productName: "Sac à main",
        sellerSku: "SKU-1",
        productImageUrl: null,
        shippedDate: null,
      },
    });

    expect(row.externalItemId).toBe(ARTICLE_A);
    expect(row.orderId).toBe(COMMANDE);
    expect(row.shopId).toBe(BOUTIQUE);
    // XOF n'a pas de décimale : 16800 FCFA = 16800 unités mineures.
    expect(row.itemPriceMinor).toBe(16800);
    expect(row.paidPriceMinor).toBe(15600);
    expect(row.shippingAmountMinor).toBe(2000);
    expect(row.currency).toBe("XOF");
  });

  it("convertit les montants en devise à deux décimales", () => {
    const row = normalizeOrderItem({
      shopId: BOUTIQUE,
      orderId: COMMANDE,
      raw: {
        id: ARTICLE_B,
        shopId: null,
        status: "PENDING",
        trackingNumber: null,
        trackingUrl: null,
        shipmentType: null,
        deliveryOption: null,
        isFulfilledByJumia: false,
        itemPriceLocal: 10.5,
        paidPriceLocal: 9.75,
        shippingAmountLocal: 1.25,
        countryCode: "NG",
        currency: "NGN",
        productName: null,
        sellerSku: null,
        productImageUrl: null,
        shippedDate: null,
      },
    });

    expect(row.itemPriceMinor).toBe(1050);
    expect(row.paidPriceMinor).toBe(975);
    expect(row.shippingAmountMinor).toBe(125);
  });
});
