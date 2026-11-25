import { describe, expect, it } from "vitest";
import { orderStatusGroup } from "@/lib/orders";
import { toCsv } from "@/lib/csv";
import { parseDay, resolveShopIds } from "@/lib/order-access";

describe("groupes de statuts des commandes", () => {
  it("range un statut Jumia dans sa rubrique, sans casse ni séparateur", () => {
    expect(orderStatusGroup("SHIPPED")).toBe("shipped");
    expect(orderStatusGroup("PickedUp")).toBe("shipped");
    expect(orderStatusGroup("DELIVERED")).toBeNull();
    expect(orderStatusGroup("CANCELED")).toBeNull();
    expect(orderStatusGroup("created")).toBe("action");
    expect(orderStatusGroup("RETURNED")).toBe("returned");
    expect(orderStatusGroup("REFUNDED")).toBe("returned");
  });
});

describe("CSV", () => {
  it("produit un fichier Excel-compatible avec BOM et guillemets doublés", () => {
    const csv = toCsv(
      [
        { key: "a", label: "Article" },
        { key: "b", label: "Note" },
      ],
      [{ a: 'Chaise "bois"', b: "1" }],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Article";"Note"');
    expect(csv).toContain('"Chaise ""bois""";"1"');
  });

  it("vide une valeur manquante au lieu d'écrire null", () => {
    const csv = toCsv([{ key: "a", label: "A" }], [{ a: null }]);
    expect(csv).toContain('""');
  });
});

describe("périmètre des rubriques", () => {
  const shops = [
    {
      id: "s1",
      name: "A",
      platform: "jumia",
      country: "CI",
      status: "active",
      currency: "XOF",
      remoteShopId: null,
      remoteShopName: null,
      remoteLinkedAt: null,
      lastSyncAt: null,
      lastSyncStatus: null,
    },
    {
      id: "s2",
      name: "B",
      platform: "jumia",
      country: "CI",
      status: "active",
      currency: "USD",
      remoteShopId: null,
      remoteShopName: null,
      remoteLinkedAt: null,
      lastSyncAt: null,
      lastSyncStatus: null,
    },
  ];

  it("refuse une boutique hors du périmètre autorisé (pas d'élargissement)", () => {
    // Avant : une boutique inconnue tombait sur « toutes les boutiques », donc
    // une URL pouvait élargir le périmètre. C'est corrigé : le périmètre
    // demandé est vide, et l'interface l'annonce.
    expect(resolveShopIds("autre", shops)).toEqual([]);
    expect(resolveShopIds("s2", shops)).toEqual(["s2"]);
    // Sans boutique courante, on retombe sur les boutiques autorisées.
    expect(resolveShopIds(undefined, shops)).toEqual(["s1", "s2"]);
    // Avec une boutique courante, une seule boutique est retenue.
    expect(resolveShopIds(undefined, shops, "s2")).toEqual(["s2"]);
  });

  it("convertit les dates en UTC et refuse les valeurs invalides", () => {
    expect(parseDay("2026-11-01")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(parseDay("2026-11-01", true)?.toISOString()).toBe("2026-11-01T23:59:59.000Z");
    expect(parseDay("01/11/2026")).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });
});
