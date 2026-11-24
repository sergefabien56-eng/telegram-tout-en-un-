import { describe, expect, it } from "vitest";
import { sumStatements } from "@/lib/payments";

type Row = Parameters<typeof sumStatements>[0][number];

function row(partial: Partial<Row>): Row {
  return {
    id: partial.id ?? "id",
    shopId: "shop-1",
    statementNumber: partial.statementNumber ?? "PS1",
    currency: "XOF",
    openingBalanceMinor: 0,
    itemRevenueMinor: partial.itemRevenueMinor ?? 0,
    shipmentFeeMinor: 0,
    feesTotalMinor: partial.feesTotalMinor ?? 0,
    otherRevenueMinor: 0,
    refundsMinor: 0,
    closingBalanceMinor: partial.closingBalanceMinor ?? 0,
    payoutAmountMinor: partial.payoutAmountMinor ?? null,
    paid: partial.paid ?? true,
    paymentReference: null,
    remoteCreatedAt: new Date("2026-11-01T00:00:00Z"),
    remoteUpdatedAt: null,
    syncedAt: new Date("2026-11-01T00:00:00Z"),
  };
}

describe("sumStatements", () => {
  it("additionne les montants entiers des relevés", () => {
    const totals = sumStatements([
      row({
        statementNumber: "A",
        itemRevenueMinor: 900305,
        feesTotalMinor: -283949,
        closingBalanceMinor: 616356,
        payoutAmountMinor: 616356,
      }),
      row({
        statementNumber: "B",
        itemRevenueMinor: 1942450,
        feesTotalMinor: -656114,
        closingBalanceMinor: 1286337,
        payoutAmountMinor: 1286337,
        paid: false,
      }),
    ]);
    expect(totals.revenue).toBe(2842755);
    expect(totals.fees).toBe(-940063);
    expect(totals.net).toBe(1902693);
    expect(totals.paid).toBe(1286337 + 616356);
    expect(totals.unpaid).toBe(true);
  });
});
