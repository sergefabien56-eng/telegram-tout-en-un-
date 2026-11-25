import { describe, expect, it } from "vitest";
import {
  belongsToShop,
  orderShopIds,
  productShopId,
  statementShopSid,
} from "@/lib/shop-guard";

/**
 * Garde-fous « une boutique, une donnée » : une donnée qui porte
 * l'identifiant d'une autre boutique ne doit jamais être enregistrée sous
 * celle-ci.
 */
describe("garde-fou boutique", () => {
  it("lit les identifiants de boutique portés par Jumia", () => {
    expect(orderShopIds({ shopIds: ["boutique-a", "boutique-b"] })).toEqual([
      "boutique-a",
      "boutique-b",
    ]);
    expect(orderShopIds({ shopIds: [] })).toBeNull();
    expect(orderShopIds({})).toBeNull();
    expect(statementShopSid({ shopSid: "boutique-a" })).toBe("boutique-a");
    expect(statementShopSid({})).toBeNull();
    expect(productShopId({ shop: { id: "boutique-a" } })).toBe("boutique-a");
    expect(productShopId({ shop: {} })).toBeNull();
    expect(productShopId({})).toBeNull();
  });

  it("écarte une donnée qui appartient à une autre boutique", () => {
    expect(belongsToShop(["boutique-a"], "boutique-a")).toBe(true);
    expect(belongsToShop(["boutique-a", "boutique-b"], "boutique-b")).toBe(true);
    expect(belongsToShop(["boutique-a"], "boutique-b")).toBe(false);
    expect(belongsToShop("boutique-a", "boutique-b")).toBe(false);
  });

  it("accepte la donnée quand Jumia ne donne aucun identifiant (aucune preuve de mélange)", () => {
    expect(belongsToShop(null, "boutique-a")).toBe(true);
    expect(belongsToShop(null, null)).toBe(true);
  });

  it("accepte la donnée quand la boutique n'est pas rattachée", () => {
    expect(belongsToShop(["boutique-a"], null)).toBe(true);
  });
});
