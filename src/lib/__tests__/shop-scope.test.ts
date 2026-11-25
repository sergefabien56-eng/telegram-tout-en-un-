import { describe, expect, it } from "vitest";
import { resolveShopIds, isRefusedScope, ALL_SHOPS } from "@/lib/order-access";
import type { ScopedShop } from "@/lib/shop-scope";

/**
 * ISOLATION DU PÉRIMÈTRE — règles de résolution du filtre « boutique ».
 *
 * Ces règles sont le dernier rempart contre le mélange de boutiques :
 * un paramètre d'URL ne doit jamais élargir le périmètre, et le défaut
 * doit être une seule boutique (celle choisie par le vendeur).
 */
function shop(id: string): ScopedShop {
  return {
    id,
    name: `Boutique ${id}`,
    platform: "jumia",
    country: "CI",
    currency: "XOF",
    remoteShopId: `remote-${id}`,
    remoteShopName: `Boutique ${id}`,
    remoteLinkedAt: null,
    lastSyncAt: null,
    lastSyncStatus: null,
  };
}

const allowed = [shop("a"), shop("b"), shop("c")];

describe("résolution du périmètre boutique", () => {
  it("retient la boutique demandée quand elle est autorisée", () => {
    expect(resolveShopIds("b", allowed)).toEqual(["b"]);
  });

  it("ne retient que la boutique courante par défaut (périmètre mono-boutique)", () => {
    expect(resolveShopIds(undefined, allowed, "b")).toEqual(["b"]);
  });

  it("retombe sur toutes les boutiques autorisées si aucune boutique courante", () => {
    expect(resolveShopIds(undefined, allowed, null)).toEqual(["a", "b", "c"]);
  });

  it("ignore une boutique courante qui n'est pas autorisée", () => {
    expect(resolveShopIds(undefined, allowed, "intruse")).toEqual(["a", "b", "c"]);
  });

  it("refuse une boutique demandée mais non autorisée (jamais d'élargissement)", () => {
    // Avant, une boutique inconnue tombait sur « toutes les boutiques » :
    // l'URL pouvait donc élargir le périmètre. C'est corrigé.
    expect(resolveShopIds("11111111-1111-1111-1111-111111111111", allowed)).toEqual([]);
    expect(resolveShopIds("intruse", allowed)).toEqual([]);
  });

  it("n'élargit pas non plus quand une boutique courante est demandée", () => {
    expect(resolveShopIds("intruse", allowed, "b")).toEqual([]);
  });

  it("agrège toutes les boutiques sur demande explicite", () => {
    expect(resolveShopIds(ALL_SHOPS, allowed)).toEqual(["a", "b", "c"]);
    expect(resolveShopIds(ALL_SHOPS, allowed, "b")).toEqual(["a", "b", "c"]);
  });

  it("distingue un périmètre refusé d'un périmètre vide légitime", () => {
    expect(isRefusedScope({ boutique: "intruse" }, [])).toBe(true);
    expect(isRefusedScope({ boutique: "a" }, ["a"])).toBe(false);
    expect(isRefusedScope({ boutique: ALL_SHOPS }, [])).toBe(false);
    expect(isRefusedScope({}, [])).toBe(false);
  });
});
