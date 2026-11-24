import { describe, expect, it } from "vitest";
import { normalizeProductSet } from "@/lib/catalog";

const raw = {
  id: "d335de79-79c4-4403-b6eb-0ea6a0efe43e",
  name: "HP Spectre x360",
  parentSku: "parent-1",
  brand: { code: "1126253", name: "HP" },
  category: { code: "1004141", name: "Ordinateurs" },
  images: [
    { url: "https://img/1.jpg", originalUrl: "https://img/1.jpg", primary: true },
    { url: "https://img/2.jpg", originalUrl: "https://img/2.jpg", primary: false },
  ],
  variations: [
    {
      id: "var-1",
      sellerSku: "SKU-1",
      barcodeEan: "8682447314708",
      variation: "16 Go",
      globalPrice: { currency: "USD", value: 999.99 },
      businessClients: [
        {
          countryCode: "SN",
          status: "INACTIVE",
          visible: false,
          qc: { status: "PENDING" },
          price: { localCurrency: "XOF", localValue: 9000 },
        },
        {
          countryCode: "CI",
          status: "ACTIVE",
          visible: true,
          qc: { status: "APPROVED" },
          price: { localCurrency: "XOF", localValue: 8200, salePrice: { value: 7500 } },
        },
      ],
    },
  ],
  createdAt: "2026-09-01T08:00:00Z",
  updatedAt: "2026-11-20T09:00:00Z",
};

describe("normalizeProductSet", () => {
  it("retient le client du pays de la boutique et convertit en FCFA entiers", () => {
    const result = normalizeProductSet({
      shopId: "shop-1",
      countryCode: "CI",
      raw,
    });

    expect(result).not.toBeNull();
    expect(result?.product.name).toBe("HP Spectre x360");
    expect(result?.product.brandName).toBe("HP");
    expect(result?.product.categoryName).toBe("Ordinateurs");
    expect(result?.product.primaryImage).toBe("https://img/1.jpg");
    expect(result?.product.status).toBe("ACTIVE");

    const variant = result?.variants[0];
    expect(variant?.sellerSku).toBe("SKU-1");
    expect(variant?.currency).toBe("XOF");
    // XOF : pas de décimale → 8200 FCFA, pas 820000.
    expect(variant?.priceMinor).toBe(8200);
    expect(variant?.salePriceMinor).toBe(7500);
    expect(variant?.qcStatus).toBe("APPROVED");
    expect(variant?.visible).toBe(true);
  });

  it("retombe sur le premier client si le pays est absent", () => {
    const result = normalizeProductSet({ shopId: "shop-1", countryCode: null, raw });
    expect(result?.variants[0]?.priceMinor).toBe(9000);
    expect(result?.variants[0]?.status).toBe("INACTIVE");
  });

  it("rejette un produit sans identifiant ni nom", () => {
    expect(normalizeProductSet({ shopId: "s", countryCode: null, raw: { name: "x" } })).toBeNull();
    expect(normalizeProductSet({ shopId: "s", countryCode: null, raw: { id: "x" } })).toBeNull();
  });
});
