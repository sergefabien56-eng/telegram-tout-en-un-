import { describe, expect, it } from "vitest";
import { activeNavItem, NAV_ITEMS, NAV_SECTIONS } from "@/navigation.config";

/**
 * Navigation « Ventes et commandes ».
 *
 * La refonte impose **exactement quatre rubriques** dans la section B, et
 * chaque sous-rubrique doit activer sa propre rubrique parente.
 */
describe("section « Ventes et commandes »", () => {
  const sectionB = NAV_ITEMS.filter((item) => item.section === "B");

  it("contient exactement quatre rubriques", () => {
    expect(sectionB).toHaveLength(4);
  });

  it("nomme les quatre rubriques demandées", () => {
    expect(sectionB.map((item) => item.label)).toEqual([
      "Toutes les commandes",
      "À traiter",
      "Expédiées",
      "Villes & localités",
    ]);
  });

  it("pointe chaque rubrique vers sa propre page", () => {
    expect(sectionB.map((item) => item.href)).toEqual([
      "/commandes",
      "/commandes/a-traiter",
      "/commandes/expediees",
      "/commandes/villes",
    ]);
  });

  it("exige la permission de lecture des commandes", () => {
    for (const item of sectionB) {
      expect(item.permission).toBe("orders:read");
    }
  });

  it("conserve l'ancienne section « Ventes et commandes »", () => {
    const section = NAV_SECTIONS.find((entry) => entry.key === "B");
    expect(section?.label).toBe("Ventes et commandes");
  });
});

describe("fonctions opérationnelles conservées", () => {
  it("garde l'export des commandes accessible (déplacé hors du menu principal)", () => {
    const exportCommandes = NAV_ITEMS.find((item) => item.key === "orders-export");
    expect(exportCommandes).toBeDefined();
    expect(exportCommandes?.href).toBe("/commandes/exports");
    // L'export n'est plus une rubrique principale de la section B.
    expect(exportCommandes?.section).not.toBe("B");
  });

  it("garde la page Clients accessible", () => {
    const clients = NAV_ITEMS.find((item) => item.key === "orders-customers");
    expect(clients).toBeDefined();
    expect(clients?.href).toBe("/commandes/clients");
  });
});

describe("rubrique active", () => {
  it("active la rubrique de la sous-page la plus spécifique", () => {
    const items = NAV_ITEMS.filter((item) => item.section === "B");
    expect(activeNavItem(items, "/commandes")?.key).toBe("orders");
    expect(activeNavItem(items, "/commandes/annulees")?.key).toBe("orders");
    expect(activeNavItem(items, "/commandes/a-traiter")?.key).toBe("orders-action");
    expect(activeNavItem(items, "/commandes/a-traiter/en-attente")?.key).toBe("orders-action");
    expect(activeNavItem(items, "/commandes/a-traiter/pretes-a-expedier")?.key).toBe(
      "orders-action",
    );
    expect(activeNavItem(items, "/commandes/a-traiter/factures")?.key).toBe("orders-action");
    expect(activeNavItem(items, "/commandes/expediees")?.key).toBe("orders-shipped");
    expect(activeNavItem(items, "/commandes/retours")?.key).toBe("orders-shipped");
    expect(activeNavItem(items, "/commandes/villes")?.key).toBe("orders-cities");
  });

  it("rattache la page de détail d'une commande à son rubrique", () => {
    const items = NAV_ITEMS.filter((item) => item.section === "B");
    expect(activeNavItem(items, "/commandes/abc-123")?.key).toBe("orders");
  });

  it("ne confond pas Clients et Exports avec les rubriques de commandes", () => {
    const items = NAV_ITEMS;
    expect(activeNavItem(items, "/commandes/clients")?.key).toBe("orders-customers");
    expect(activeNavItem(items, "/commandes/exports")?.key).toBe("orders-export");
  });
});
