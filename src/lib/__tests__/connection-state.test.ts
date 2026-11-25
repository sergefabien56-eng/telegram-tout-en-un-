import { describe, expect, it } from "vitest";
import { connectionLabelFor } from "@/lib/connection-state";

/**
 * L'état de connexion doit être **factuel** : jamais un statut stocké, jamais
 * un « vert » synthétique. On teste ici chaque règle sans base de données.
 */
describe("état factuel de connexion", () => {
  const shop = {
    remoteShopId: "boutique-jumia-1",
    remoteShopName: "Ma Boutique",
    lastSyncAt: new Date("2026-11-20T10:00:00Z"),
    lastSyncStatus: "ok",
    jumiaAccountId: "compte-1",
    accountStatus: "active",
  };
  const counts = { products: 12, variants: 20, orders: 34, statements: 3 };

  it("refuse d'afficher « Connectée » pour une boutique non rattachée", () => {
    const label = connectionLabelFor({ ...shop, remoteShopId: null }, counts);
    expect(label.state).toBe("non_rattachee");
    expect(label.operational).toBe(false);
    expect(label.detail).toContain("aucune boutique Jumia");
  });

  it("refuse d'afficher « Connectée » sans compte vendeur lié", () => {
    const label = connectionLabelFor({ ...shop, jumiaAccountId: null }, counts);
    expect(label.state).toBe("compte_manquant");
    expect(label.operational).toBe(false);
    expect(label.detail).toContain("jamais le compte d'une autre");
  });

  it("signale un compte vendeur invalide (refresh token refusé)", () => {
    const label = connectionLabelFor({ ...shop, accountStatus: "expired" }, counts);
    expect(label.state).toBe("compte_invalide");
    expect(label.operational).toBe(false);
  });

  it("ne déclare pas opérationnelle une boutique qui n'a encore reçu aucune donnée", () => {
    const label = connectionLabelFor(shop, {
      products: 0,
      variants: 0,
      orders: 0,
      statements: 0,
    });
    expect(label.state).toBe("connectee_sans_donnees");
    expect(label.operational).toBe(false);
    expect(label.detail).toContain("aucune commande");
  });

  it("signale des données incomplètes quand la dernière synchronisation a échoué", () => {
    const label = connectionLabelFor({ ...shop, lastSyncStatus: "error" }, counts);
    expect(label.state).toBe("donnees_incompletes");
    expect(label.operational).toBe(false);
    expect(label.detail).toContain("error");
  });

  it("déclare opérationnelle une boutique liée, synchronisée et peuplée", () => {
    const label = connectionLabelFor(shop, counts);
    expect(label.state).toBe("connectee");
    expect(label.operational).toBe(true);
    expect(label.detail).toContain("2026-11-20 10:00");
  });

  it("reste opérationnelle même si la dernière synchronisation est ancienne", () => {
    const label = connectionLabelFor(
      { ...shop, lastSyncAt: new Date("2026-01-01T00:00:00Z") },
      counts,
    );
    // La péremption est un avertissement du diagnostic, pas un blocage.
    expect(label.operational).toBe(true);
  });

  it("traite l'absence de volumétrie comme une absence de données (pas d'exception)", () => {
    const label = connectionLabelFor(shop, undefined);
    expect(label.state).toBe("connectee_sans_donnees");
    expect(label.operational).toBe(false);
  });
});
