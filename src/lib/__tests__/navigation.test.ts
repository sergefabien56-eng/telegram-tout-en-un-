import { describe, expect, it } from "vitest";
import { NAV_ITEMS, NAV_SECTIONS } from "@/navigation.config";
import { NAV_ICONS } from "@/components/nav-icons";

/** La configuration de navigation est la source unique : elle doit être cohérente. */
describe("navigation.config", () => {
  it("a des clés et des libellés uniques", () => {
    const keys = NAV_ITEMS.map((item) => item.key);
    const labels = NAV_ITEMS.map((item) => item.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("ne référence que des modules et des icônes existants", () => {
    const sections = new Set(NAV_SECTIONS.map((section) => section.key));
    for (const item of NAV_ITEMS) {
      expect(sections.has(item.section), `${item.key} : section inconnue`).toBe(true);
      expect(NAV_ICONS[item.icon], `${item.key} : icône inconnue`).toBeTruthy();
    }
  });

  it("couvre les rubriques demandées par la mission Mini App", () => {
    const labels = new Set(NAV_ITEMS.map((item) => item.label));
    for (const attendu of [
      "Vue d'ensemble",
      "Recherche dans mon espace",
      "Apparence",
      "Indicateurs financiers",
      "Performances globales",
      "Activités récentes",
      "Alertes importantes",
      "Toutes les commandes",
      "À traiter",
      "Expédiées",
      "Retours",
      "Factures originales",
      "Clients",
      "Exports",
      "Toutes les boutiques",
      "Ajouter une boutique",
      "Comptes Jumia",
      "Connexions Jumia",
      "Synchronisations",
      "Réglages boutiques",
      "Produits",
      "Catégories",
      "Prix",
      "Stocks",
      "Mouvements",
      "Entrepôts",
      "Inventaires",
      "Vue financière",
      "Relevés Jumia",
      "Dépenses",
      "Achats",
      "Rapprochements",
      "Exports financiers",
      "Tous les rapports",
      "Par boutique",
      "Par produit",
      "Rentabilité",
      "Téléchargements",
      "Assistante MIMI",
      "Règles",
      "Tâches planifiées",
      "Notifications",
      "Utilisateurs",
      "Rôles",
      "Membres de la boutique",
      "Journal d'activité",
      "Paramètres",
      "Système",
    ]) {
      expect(labels.has(attendu), `rubrique manquante : ${attendu}`).toBe(true);
    }
  });

  it("ne marque « À venir » que les rubriques sans fonction réelle", () => {
    const soon = NAV_ITEMS.filter((item) => item.soon).map((item) => item.label);
    expect(new Set(soon)).toEqual(
      new Set([
        "Réglages boutiques",
        "Mouvements",
        "Entrepôts",
        "Inventaires",
        "Dépenses",
        "Achats",
        "Rapprochements",
        "Règles",
        "Tâches planifiées",
        "Paramètres",
      ]),
    );
  });
});
