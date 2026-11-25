import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavItem, getNavItems } from "@/navigation.config";

/**
 * Module « Boutiques & Plateformes » — quatre rubriques exactement.
 *
 * Les opérations (comptes Jumia, rattachement, synchronisations) ne doivent
 * plus être des rubriques principales : elles sont portées par « Ajouter une
 * boutique Jumia » et « Toutes les boutiques ».
 */
describe("rubriques du module Boutiques et plateformes", () => {
  const rubriques = NAV_ITEMS.filter((item) => item.section === "C");

  it("compte exactement quatre rubriques", () => {
    expect(rubriques).toHaveLength(4);
  });

  it("porte les quatre libellés demandés", () => {
    expect(rubriques.map((item) => item.label)).toEqual([
      "Toutes les boutiques",
      "Ajouter une boutique Jumia",
      "Ajouter un produit",
      "Réseaux sociaux",
    ]);
  });

  it("ne recrée pas de rubriques « Connexions Jumia », « Synchronisations » ou « Réglages boutiques »", () => {
    const libelles = rubriques.map((item) => item.label);
    expect(libelles).not.toContain("Connexions Jumia");
    expect(libelles).not.toContain("Synchronisations");
    expect(libelles).not.toContain("Réglages boutiques");
    expect(libelles).not.toContain("Comptes Jumia");
  });

  it("conserve les pages existantes : les opérations restent atteignables", () => {
    // La page des synchronisations existe toujours, même si elle n'est plus
    // une rubrique de menu : elle est liée depuis « Toutes les boutiques ».
    expect(
      existsSync(
        fileURLToPath(
          new URL("../../app/(app)/boutiques/synchronisations/page.tsx", import.meta.url),
        ),
      ),
    ).toBe(true);
    const pageBoutiques = readFileSync(
      fileURLToPath(new URL("../../app/(app)/boutiques/page.tsx", import.meta.url)),
      "utf8",
    );
    expect(pageBoutiques).toContain("/boutiques/synchronisations");
    expect(pageBoutiques).toContain("/boutiques/ajouter");
  });

  it("marque « Réseaux sociaux » comme à venir, sans lien mort", () => {
    const social = rubriques.find((item) => item.label === "Réseaux sociaux");
    expect(social?.soon).toBe(true);
  });

  it("rattache l'ajout d'un produit à la rubrique correspondante", () => {
    const items = getNavItems("C", new Set(["*"]));
    const actif = activeNavItem(items, "/boutiques/produits/nouveau");
    expect(actif?.label).toBe("Ajouter un produit");
  });

  it("rattache l'ajout d'une boutique à la rubrique correspondante", () => {
    const items = getNavItems("C", new Set(["*"]));
    expect(activeNavItem(items, "/boutiques/ajouter")?.label).toBe("Ajouter une boutique Jumia");
  });

  it("laisse « Toutes les boutiques » active sur la liste", () => {
    const items = getNavItems("C", new Set(["*"]));
    expect(activeNavItem(items, "/boutiques")?.label).toBe("Toutes les boutiques");
  });
});
