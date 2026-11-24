import { describe, expect, it } from "vitest";
import { normalizeOrder, toMinorUnits } from "@/lib/orders";

describe("toMinorUnits", () => {
  it("XOF n'a pas de décime : le montant est un entier de FCFA", () => {
    expect(toMinorUnits(1250, "XOF")).toBe(1250);
  });

  it("USD a deux décimales et arrondit proprement", () => {
    expect(toMinorUnits(12.345, "USD")).toBe(1235);
    expect(toMinorUnits("60.00", "EUR")).toBe(6000);
  });

  it("refuse les valeurs non numériques", () => {
    expect(toMinorUnits("abc", "XOF")).toBeNull();
    expect(toMinorUnits(Number.NaN, "XOF")).toBeNull();
  });
});

describe("normalizeOrder", () => {
  const shopId = "11111111-1111-1111-1111-111111111111";

  it("retient le montant local (FCFA) et l'UTC", () => {
    const row = normalizeOrder(shopId, {
      id: "41ea7c3b-20f0-466d-a095-e6e909298180",
      number: "338997922",
      status: "PENDING",
      totalAmount: { currency: "USD", value: 12.34 },
      totalAmountLocal: { currency: "XOF", value: 8200 },
      country: { code: "CI" },
      shippingAddress: { firstName: "Awa", lastName: "Traoré", city: "Abidjan" },
      totalItems: 2,
      packedItems: 1,
      isPrepayment: false,
      hasMultipleStatus: false,
      deliveryOption: "Flat Rate",
      createdAt: "2026-11-20T10:15:00Z",
      updatedAt: "2026-11-21T08:00:00Z",
    });

    expect(row).not.toBeNull();
    expect(row?.externalOrderId).toBe("41ea7c3b-20f0-466d-a095-e6e909298180");
    expect(row?.orderNumber).toBe("338997922");
    expect(row?.status).toBe("PENDING");
    expect(row?.currency).toBe("XOF");
    expect(row?.totalAmountMinor).toBe(8200);
    expect(row?.totalAmountUsdMinor).toBe(1234);
    expect(row?.countryCode).toBe("CI");
    expect(row?.customerCity).toBe("Abidjan");
    expect(row?.remoteCreatedAt?.toISOString()).toBe("2026-11-20T10:15:00.000Z");
    expect(row?.raw).toHaveProperty("number", "338997922");
  });

  it("rejette une commande sans identifiant ni statut (R1)", () => {
    expect(normalizeOrder(shopId, { status: "PENDING" })).toBeNull();
    expect(normalizeOrder(shopId, { id: "x" })).toBeNull();
  });

  it("reste exploitable sur une forme partielle", () => {
    const row = normalizeOrder(shopId, { id: "cmd-1", status: "SHIPPED", totalAmountLocal: {} });
    expect(row?.status).toBe("SHIPPED");
    expect(row?.totalAmountMinor).toBe(0);
    expect(row?.currency).toBe("XOF");
  });
});
