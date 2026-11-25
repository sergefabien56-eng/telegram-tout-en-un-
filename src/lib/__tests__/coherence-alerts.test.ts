import { describe, expect, it } from "vitest";
import { alertableIssues, dedupeKey } from "@/lib/coherence-alerts";
import type { CoherenceAnomaly } from "@/lib/coherence";
import type { CoherenceDrift } from "@/lib/coherence-history";

/**
 * ALERTES DE COHÉRENCE — règles de sélection.
 *
 * Une alerte inutile est du bruit : le vendeur finit par ignorer les
 * notifications. On vérifie donc que seules les anomalies **actionnables**
 * sont signalées, et qu'une dérive l'est aussi.
 */
function anomaly(overrides: Partial<CoherenceAnomaly> = {}): CoherenceAnomaly {
  return {
    code: "montant_divergent",
    severity: "critique",
    title: "Un montant diverge",
    evidence: "Preuve chiffrée.",
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

describe("sélection des problèmes à signaler", () => {
  it("signale une anomalie critique", () => {
    const issues = alertableIssues([anomaly()], null);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("montant_divergent");
    expect(issues[0]?.title).toContain("Cohérence");
  });

  it("signale une anomalie d'avertissement", () => {
    const issues = alertableIssues(
      [anomaly({ code: "releve_non_attribuable", severity: "avertissement" })],
      null,
    );
    expect(issues).toHaveLength(1);
  });

  it("ne signale pas une anomalie d'information (bruit)", () => {
    // Un statut de commande périmé est normal : il ne doit pas alerter.
    const issues = alertableIssues(
      [anomaly({ code: "commande_non_synchronisee", severity: "information" })],
      null,
    );
    expect(issues).toHaveLength(0);
  });

  it("ne signale rien quand tout va bien", () => {
    expect(alertableIssues([], null)).toHaveLength(0);
  });

  it("signale une dérive", () => {
    const issues = alertableIssues([], drift);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("derive_montant_recule");
    expect(issues[0]?.title).toContain("Évolution");
  });

  it("ne signale pas une dérive résolue (bonne nouvelle)", () => {
    // Un écart qui disparaît est une information, pas un problème : alerter
    // dessus serait du bruit.
    const issues = alertableIssues(
      [],
      {
        ...drift,
        code: "ecart_resolu",
        severity: "information",
        title: "L'écart précédent est résolu",
      },
    );
    expect(issues).toHaveLength(0);
  });

  it("ne signale pas deux fois la même dérive (anomalie + dérive)", () => {
    // Le diagnostic injecte la dérive dans les anomalies avec le même code :
    // une seule alerte doit partir.
    const issues = alertableIssues(
      [anomaly({ code: "derive_montant_recule", severity: "avertissement" })],
      drift,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("derive_montant_recule");
  });

  it("signale à la fois les anomalies et la dérive", () => {
    const issues = alertableIssues([anomaly(), anomaly({ code: "releve_manquant" })], drift);
    expect(issues).toHaveLength(3);
    expect(new Set(issues.map((issue) => issue.code)).size).toBe(3);
  });

  it("inclut la preuve et l'action dans le corps de l'alerte", () => {
    const issues = alertableIssues([anomaly()], null);
    expect(issues[0]?.body).toContain("Preuve chiffrée.");
    expect(issues[0]?.body).toContain("Resynchroniser.");
  });
});

describe("clé de déduplication", () => {
  it("décrit le problème : boutique, jour, code", () => {
    expect(dedupeKey("shop-1", "2026-11-25", "montant_divergent")).toBe(
      "coherence:shop-1:2026-11-25:montant_divergent:web",
    );
  });

  it("distingue les canaux (web et Telegram)", () => {
    expect(dedupeKey("shop-1", "2026-11-25", "montant_divergent", "telegram")).not.toBe(
      dedupeKey("shop-1", "2026-11-25", "montant_divergent", "web"),
    );
  });

  it("distingue les jours (un contrôle quotidien, une alerte par jour)", () => {
    expect(dedupeKey("shop-1", "2026-11-25", "montant_divergent")).not.toBe(
      dedupeKey("shop-1", "2026-11-26", "montant_divergent"),
    );
  });
});
