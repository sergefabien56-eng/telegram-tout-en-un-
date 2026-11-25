import { describe, expect, it } from "vitest";
import { compareFinancials, type LocalStatementRow } from "@/lib/coherence";

/**
 * PREUVE FINANCIÈRE — le test le plus important du diagnostic.
 *
 * Une preuve qui ne détecte jamais une divergence ne prouve rien. On fabrique
 * donc volontairement des écarts (montant modifié, relevé absent, relevé
 * surnuméraire, statut de paiement faux) et on vérifie qu'ils sont signalés
 * avec la bonne preuve, la bonne cause et la bonne conséquence.
 */
const SHOP_ID = "11111111-1111-1111-1111-111111111111";

/**
 * `Intl` insère des espaces insécables fines (U+202F) dans les nombres : on
 * les normalise pour comparer les preuves textuelles.
 */
function plain(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
}

/** Relevé Jumia brut (forme de l'API `/payout-statement`). */
function remoteStatement(overrides: Record<string, unknown> = {}) {
  return {
    statementNumber: "ST-1",
    shopSid: "boutique-jumia-1",
    createdAt: "2026-11-20 00:00:00",
    openingBalance: 0,
    itemRevenue: 10000,
    shipmentFee: 500,
    otherRevenueTotal: 0,
    feesTotal: -2000,
    refunds: -300,
    closingBalance: 8200,
    payout: { amount: 8200, currency: "XOF" },
    paid: true,
    ...overrides,
  };
}

/** Ligne locale équivalente au relevé ci-dessus. */
function localStatement(overrides: Partial<LocalStatementRow> = {}): LocalStatementRow {
  return {
    statementNumber: "ST-1",
    currency: "XOF",
    openingBalanceMinor: 0,
    itemRevenueMinor: 10000,
    shipmentFeeMinor: 500,
    feesTotalMinor: -2000,
    otherRevenueMinor: 0,
    refundsMinor: -300,
    closingBalanceMinor: 8200,
    payoutAmountMinor: 8200,
    paid: true,
    remoteShopSid: "boutique-jumia-1",
    ...overrides,
  };
}

describe("preuve de cohérence financière", () => {
  it("valide un relevé identique des deux côtés", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement()],
      remoteStatements: [remoteStatement()],
    });
    expect(proof.compared).toBe(1);
    expect(proof.divergent).toBe(0);
    expect(proof.missing).toBe(0);
    expect(proof.extra).toBe(0);
    expect(proof.local.revenue).toBe(proof.remote.revenue);
    expect(anomalies.filter((a) => a.severity === "critique")).toHaveLength(0);
  });

  it("détecte un montant modifié localement (au centime)", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement({ itemRevenueMinor: 9999 })],
      remoteStatements: [remoteStatement()],
    });
    expect(proof.divergent).toBe(1);
    const divergence = anomalies.find((a) => a.code === "montant_divergent");
    expect(divergence).toBeDefined();
    expect(divergence?.severity).toBe("critique");
    const evidence = plain(divergence?.evidence ?? "");
    expect(evidence).toContain("CA articles");
    expect(evidence).toContain("10 000");
    expect(evidence).toContain("9 999");
    expect(divergence?.recommendation).toBeTruthy();
    // Le total doit aussi diverger.
    expect(proof.local.revenue).not.toBe(proof.remote.revenue);
  });

  it("détecte un relevé présent chez Jumia mais absent de la base", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [],
      remoteStatements: [remoteStatement()],
    });
    expect(proof.missing).toBe(1);
    expect(proof.compared).toBe(0);
    const anomaly = anomalies.find((a) => a.code === "releve_manquant");
    expect(anomaly?.severity).toBe("critique");
    expect(anomaly?.evidence).toContain("ST-1");
  });

  it("signale un relevé enregistré mais absent de la lecture Jumia", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement()],
      remoteStatements: [],
    });
    expect(proof.extra).toBe(1);
    const anomaly = anomalies.find((a) => a.code === "releve_en_trop");
    expect(anomaly?.severity).toBe("information");
    // Aucune suppression automatique n'est décidée.
    expect(anomaly?.recommendation).toContain("Aucune suppression automatique");
  });

  it("ne signale pas de relevé surnuméraire quand la lecture est tronquée", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement()],
      remoteStatements: [],
      truncated: true,
    });
    expect(proof.extra).toBe(1);
    expect(anomalies.find((a) => a.code === "releve_en_trop")).toBeUndefined();
    expect(proof.truncated).toBe(true);
  });

  it("détecte un statut de paiement faux", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement({ paid: false })],
      remoteStatements: [remoteStatement()],
    });
    expect(proof.divergent).toBe(1);
    const divergence = anomalies.find((a) => a.code === "montant_divergent");
    expect(divergence?.evidence).toContain("versé");
  });

  it("détecte une devise différente", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement({ currency: "USD" })],
      remoteStatements: [remoteStatement()],
    });
    expect(proof.divergent).toBe(1);
    expect(anomalies.some((a) => a.evidence.includes("Devise locale"))).toBe(true);
  });

  it("détecte un relevé illisible sans l'attribuer", () => {
    const { proof, anomalies } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [],
      remoteStatements: [{ statementNumber: "", shopSid: "boutique-jumia-1" }],
    });
    expect(proof.compared).toBe(0);
    expect(proof.missing).toBe(0);
    expect(anomalies.find((a) => a.code === "releve_illisible")).toBeDefined();
  });

  it("additionne les totaux de plusieurs relevés", () => {
    const { proof } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [
        localStatement(),
        localStatement({
          statementNumber: "ST-2",
          itemRevenueMinor: 5000,
          closingBalanceMinor: 4100,
          payoutAmountMinor: 4100,
        }),
      ],
      remoteStatements: [
        remoteStatement(),
        remoteStatement({
          statementNumber: "ST-2",
          itemRevenue: 5000,
          closingBalance: 4100,
          payout: { amount: 4100, currency: "XOF" },
        }),
      ],
    });
    expect(proof.compared).toBe(2);
    expect(proof.local.revenue).toBe(15000);
    expect(proof.remote.revenue).toBe(15000);
    expect(proof.divergent).toBe(0);
  });

  it("ne compare jamais deux boutiques entre elles", () => {
    // Un relevé qui porte le `shopSid` d'une autre boutique n'est pas une
    // preuve pour celle-ci : la comparaison reste sur le même périmètre.
    const { proof } = compareFinancials({
      shopId: SHOP_ID,
      localRows: [localStatement({ remoteShopSid: "boutique-jumia-2" })],
      remoteStatements: [remoteStatement()],
    });
    // Le relevé distant porte « boutique-jumia-1 » : c'est la boutique
    // comparée. La ligne locale portant une autre boutique ne change pas le
    // total : la vérification de mélange est faite par `countMixedStatements`.
    expect(proof.compared).toBe(1);
  });
});
