import { describe, expect, it } from "vitest";
import { detectDrift, type CoherenceSnapshot } from "@/lib/coherence-history";

/**
 * HISTORIQUE DE COHÉRENCE — détection de dérive.
 *
 * L'historique ne sert à rien s'il ne repère pas une dérive. On fabrique donc
 * des instantanés consécutifs dégradés et on vérifie que la dérive est
 * signalée avec la bonne gravité et une cause explicable.
 */
function snapshot(overrides: Partial<CoherenceSnapshot> = {}): CoherenceSnapshot {
  return {
    id: "snap-1",
    shopId: "shop-1",
    day: "2026-11-25",
    status: "coherent",
    localProducts: 16,
    localOrders: 193,
    localStatements: 13,
    remoteProducts: 16,
    remoteOrders: 193,
    remoteStatements: 13,
    revenueMinor: 512_449,
    remoteRevenueMinor: 512_449,
    netMinor: 327_944,
    remoteNetMinor: 327_944,
    ordersAmountMinor: 883_917,
    remoteOrdersAmountMinor: 883_917,
    anomalies: 0,
    anomalyCodes: [],
    checkedAt: new Date("2026-11-25T08:00:00Z"),
    ...overrides,
  };
}

describe("détection de dérive", () => {
  it("ne signale rien avec un seul instantané", () => {
    expect(detectDrift([snapshot()])).toBeNull();
  });

  it("ne signale rien quand tout est stable", () => {
    const drift = detectDrift([
      snapshot(),
      snapshot({ id: "snap-0", day: "2026-11-24", checkedAt: new Date("2026-11-24T08:00:00Z") }),
    ]);
    expect(drift).toBeNull();
  });

  it("signale un CA articles qui recule", () => {
    const drift = detectDrift([
      snapshot({ revenueMinor: 512_449 }),
      snapshot({ id: "snap-0", day: "2026-11-24", revenueMinor: 562_449 }),
    ]);
    expect(drift?.code).toBe("montant_recule");
    expect(drift?.severity).toBe("avertissement");
    expect(drift?.evidence).toContain("562449");
    expect(drift?.evidence).toContain("512449");
    expect(drift?.cause).toBeTruthy();
    expect(drift?.recommendation).toBeTruthy();
  });

  it("signale l'apparition d'un écart", () => {
    const drift = detectDrift([
      snapshot({ anomalies: 2, anomalyCodes: ["montant_divergent"] }),
      snapshot({ id: "snap-0", day: "2026-11-24", anomalies: 0 }),
    ]);
    expect(drift?.code).toBe("ecart_apparu");
    expect(drift?.severity).toBe("avertissement");
    expect(drift?.evidence).toContain("montant_divergent");
  });

  it("signale la résolution d'un écart", () => {
    const drift = detectDrift([
      snapshot({ anomalies: 0 }),
      snapshot({ id: "snap-0", day: "2026-11-24", anomalies: 1, anomalyCodes: ["releve_manquant"] }),
    ]);
    expect(drift?.code).toBe("ecart_resolu");
    expect(drift?.severity).toBe("information");
  });

  it("signale une chute du nombre de commandes locales alors que la source reste stable", () => {
    const drift = detectDrift([
      snapshot({ localOrders: 188, remoteOrders: 193 }),
      snapshot({ id: "snap-0", day: "2026-11-24", localOrders: 193, remoteOrders: 193 }),
    ]);
    expect(drift?.code).toBe("volume_aplati");
    expect(drift?.severity).toBe("avertissement");
    expect(drift?.evidence).toContain("188");
  });

  it("ne signale pas de chute quand la source a chuté aussi", () => {
    // Jumia ne renvoie plus certaines commandes : ce n'est pas une perte
    // locale, c'est un changement à la source.
    const drift = detectDrift([
      snapshot({ localOrders: 188, remoteOrders: 188 }),
      snapshot({ id: "snap-0", day: "2026-11-24", localOrders: 193, remoteOrders: 193 }),
    ]);
    expect(drift).toBeNull();
  });
});
