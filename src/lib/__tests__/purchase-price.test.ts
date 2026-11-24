import { describe, expect, it } from "vitest";
import { marginOf, type VariantRow } from "@/lib/catalog";

function variante(partial: Partial<VariantRow>): VariantRow {
  return {
    id: "v",
    productId: "p",
    externalVariantId: "x",
    sellerSku: "SKU",
    barcodeEan: null,
    variationName: null,
    currency: "XOF",
    priceMinor: null,
    salePriceMinor: null,
    status: null,
    visible: null,
    qcStatus: null,
    stockGlobal: null,
    purchasePriceMinor: null,
    stockUpdatedAt: null,
    raw: null,
    syncedAt: new Date(),
    ...partial,
  };
}

describe("marge sur prix d'achat saisi à la main", () => {
  it("calcule vente − achat quand les deux sont connus", () => {
    expect(marginOf(variante({ priceMinor: 10_000, purchasePriceMinor: 6_500 }))).toBe(3_500);
  });

  it("utilise le prix promotionnel s'il existe", () => {
    expect(
      marginOf(variante({ priceMinor: 10_000, salePriceMinor: 8_000, purchasePriceMinor: 6_500 })),
    ).toBe(1_500);
  });

  it("renvoie « pas de marge » tant que l'achat n'est pas renseigné", () => {
    expect(marginOf(variante({ priceMinor: 10_000 }))).toBeNull();
    expect(marginOf(variante({ purchasePriceMinor: 6_500 }))).toBeNull();
  });
});

import { purchasePriceSchema } from "@/lib/purchase-price";

describe("validation de la saisie du prix d'achat", () => {
  it("accepte un montant positif et un sku", () => {
    expect(purchasePriceSchema.safeParse({ sku: "ABC-1", price: 1500 }).success).toBe(true);
  });

  it("accepte l'effacement (null) et refuse les valeurs aberrantes", () => {
    expect(purchasePriceSchema.safeParse({ sku: "ABC-1", price: null }).success).toBe(true);
    expect(purchasePriceSchema.safeParse({ sku: "ABC-1", price: -1 }).success).toBe(false);
    expect(purchasePriceSchema.safeParse({ sku: "", price: 10 }).success).toBe(false);
    expect(purchasePriceSchema.safeParse({ sku: "ABC-1" }).success).toBe(false);
  });
});
