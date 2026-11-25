import { describe, expect, it } from "vitest";
import { shouldAlert } from "@/lib/diagnostics";
import type { CoherenceAnomaly } from "@/lib/coherence";
import type { CoherenceDrift } from "@/lib/coherence-history";

/**
 * DÉCLENCHEMENT DES ALERTES — diagnostic.
 *
 * Le vendeur doit être prévenu quand quelque chose **actionnable** est
 * détecté : une anomalie critique, un avertissement, ou une **dérive**.
 * Une boutique cohérente et stable ne doit produire aucune alerte.
 */
function anomaly(overrides: Partial<CoherenceAnomaly> = {}): CoherenceAnomaly {
  return {
    code: "montant_divergent",
    severity: "critique",
    title: "Un montant diverge",
    evidence: "Preuve.",
    cause: "Cause.",
    recommendation: "Resynchroniser.",
    ...overrides,
  };
}

const drift: CoherenceDrift = {
  code: "montant_recule",
  severity: "avertissement",
  title: "Le CA articles a reculé nettement",
  evidence: "Preuve.",
  cause: "Cause.",
  recommendation: "Vérifier.",
};

describe("déclenchement des alertes de cohérence", () => {
  it("alerte sur une anomalie critique", () => {
    expect(shouldAlert([anomaly()], null)).toBe(true);
  });

  it("alerte sur un avertissement", () => {
    expect(shouldAlert([anomaly({ severity: "avertissement" })], null)).toBe(true);
  });

  it("n'alerte pas sur une simple information", () => {
    expect(shouldAlert([anomaly({ severity: "information" })], null)).toBe(false);
  });

  it("n'alerte pas quand tout est cohérent", () => {
    expect(shouldAlert([], null)).toBe(false);
  });

  it("alerte sur une dérive seule, sans anomalie", () => {
    // C'est le cas manquant : le contrôle du jour peut être parfait alors
    // que la boutique dérive par rapport à sa référence locale.
    expect(shouldAlert([], drift)).toBe(true);
  });

  it("n'alerte pas sur une dérive résolue (information)", () => {
    expect(
      shouldAlert([], { ...drift, code: "ecart_resolu", severity: "information" }),
    ).toBe(false);
  });
});
