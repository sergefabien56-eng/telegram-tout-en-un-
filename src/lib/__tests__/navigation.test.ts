import { describe, expect, it } from "vitest";
import { getNavItems, NAV_ITEMS, NAV_SECTIONS } from "@/navigation.config";

/** La navigation est la source unique web + Mini App : on vérifie son filtrage. */
describe("navigation", () => {
  it("expose les 8 sections prévues", () => {
    expect(NAV_SECTIONS).toHaveLength(8);
    expect(NAV_SECTIONS.map((section) => section.key)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
    ]);
  });

  it("filtre les entrées par permission (côté serveur)", () => {
    const items = getNavItems("H", new Set(["admin:read"]));
    expect(items.map((item) => item.key)).toContain("sante");
    expect(items.map((item) => item.key)).toContain("admin");

    const anonymous = getNavItems("H", new Set());
    expect(anonymous.map((item) => item.key)).not.toContain("sante");
  });

  it("ne masque jamais une entrée sans permission", () => {
    const items = getNavItems("C", new Set());
    expect(items.map((item) => item.key)).toContain("shops");
  });

  it("conserve la mention « Bientôt disponible » pour les modules non branchés", () => {
    // Commandes est branché (Phase 2, lot 2) : la mention a dû disparaître.
    const orders = NAV_ITEMS.find((item) => item.key === "orders");
    expect(orders?.soon).toBeUndefined();
    // Produits et Stocks sont branchés (Phase 2, lot 3).
    const products = NAV_ITEMS.find((item) => item.key === "products");
    expect(products?.soon).toBeUndefined();
    const inventory = NAV_ITEMS.find((item) => item.key === "inventory");
    expect(inventory?.soon).toBeUndefined();
    // Finances est branché (Phase 2, lot 4) ; les modules restants restent marqués.
    const finance = NAV_ITEMS.find((item) => item.key === "finance");
    expect(finance?.soon).toBeUndefined();
    // Rapports est branché (Phase 2, lot 5).
    const reports = NAV_ITEMS.find((item) => item.key === "reports");
    expect(reports?.soon).toBeUndefined();
    const reste = NAV_ITEMS.filter((item) => item.soon);
    expect(reste.length).toBeGreaterThan(0);
    const shops = NAV_ITEMS.find((item) => item.key === "shops");
    expect(shops?.soon).toBeUndefined();
  });

  it("pointe le tableau de bord vers /dashboard et non /", () => {
    const dashboard = NAV_ITEMS.find((item) => item.key === "dashboard");
    expect(dashboard?.href).toBe("/dashboard");
  });

  it("expose une entrée Sécurité (2FA) accessible à tous les rôles", () => {
    const securite = NAV_ITEMS.find((item) => item.key === "securite");
    expect(securite?.href).toBe("/securite");
    expect(securite?.permission).toBeUndefined();
    const items = getNavItems("H", new Set());
    expect(items.map((item) => item.key)).toContain("securite");
  });
});
