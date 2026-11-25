import { describe, expect, it, vi } from "vitest";

/**
 * ISOLATION : une synchronisation ne doit jamais mélanger deux boutiques.
 *
 * Ces tests s'appuient sur le refus des lots multi-boutiques mis en place
 * dans `upsertOrders` et `upsertProductSets` : si un lot concerne deux
 * boutiques, l'écriture est refusée avant d'atteindre la base.
 */
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("La base ne doit pas être atteinte : le lot doit être refusé avant.");
  },
  schema: {},
}));

describe("refus des lots multi-boutiques", () => {
  it("refuse un lot de commandes qui concerne deux boutiques", async () => {
    const { upsertOrders } = await import("@/lib/orders");
    await expect(
      upsertOrders([
        {
          shopId: "boutique-a",
          externalOrderId: "cmd-1",
          orderNumber: "1",
          status: "PENDING",
          currency: "XOF",
          totalAmountMinor: 1000,
          raw: { id: "cmd-1" },
        } as never,
        {
          shopId: "boutique-b",
          externalOrderId: "cmd-2",
          orderNumber: "2",
          status: "PENDING",
          currency: "XOF",
          totalAmountMinor: 2000,
          raw: { id: "cmd-2" },
        } as never,
      ]),
    ).rejects.toThrow(/multi-boutiques refusé/);
  });

  it("refuse un lot de catalogue qui concerne deux boutiques", async () => {
    const { upsertProductSets } = await import("@/lib/catalog");
    await expect(
      upsertProductSets([
        {
          product: {
            shopId: "boutique-a",
            externalProductId: "p-1",
            title: "Produit A",
            currency: "XOF",
            priceMinor: 1000,
            raw: { id: "p-1" },
          } as never,
          variants: [],
        },
        {
          product: {
            shopId: "boutique-b",
            externalProductId: "p-2",
            title: "Produit B",
            currency: "XOF",
            priceMinor: 2000,
            raw: { id: "p-2" },
          } as never,
          variants: [],
        },
      ]),
    ).rejects.toThrow(/multi-boutiques refusé/);
  });

  it("accepte un lot d'une seule boutique (jusqu'à la base)", async () => {
    const { upsertOrders } = await import("@/lib/orders");
    // La base est mockée pour qu'elle refuse : la seule preuve qui compte ici
    // est que l'erreur n'est PAS le refus multi-boutiques.
    await expect(
      upsertOrders([
        {
          shopId: "boutique-a",
          externalOrderId: "cmd-1",
          orderNumber: "1",
          status: "PENDING",
          currency: "XOF",
          totalAmountMinor: 1000,
          raw: { id: "cmd-1" },
        } as never,
      ]),
    ).rejects.toThrow(/La base ne doit pas être atteinte/);
  });
});
