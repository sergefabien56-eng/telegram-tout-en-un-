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
      [{ key: "a", label: "Article" }, { key: "b", label: "Note" }],
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
    { id: "s1", name: "A", remoteShopId: null, remoteShopName: null, currency: "XOF" },
    { id: "s2", name: "B", remoteShopId: null, remoteShopName: null, currency: "USD" },
  ];

  it("ignore une boutique hors du périmètre autorisé", () => {
    expect(resolveShopIds("autre", shops)).toEqual(["s1", "s2"]);
    expect(resolveShopIds("s2", shops)).toEqual(["s2"]);
  });

  it("convertit les dates en UTC et refuse les valeurs invalides", () => {
    expect(parseDay("2026-11-01")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(parseDay("2026-11-01", true)?.toISOString()).toBe("2026-11-01T23:59:59.000Z");
    expect(parseDay("01/11/2026")).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });
});
