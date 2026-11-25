import { describe, expect, it } from "vitest";
import { compareOrders, type LocalOrderRow } from "@/lib/coherence";

/**
 * PREUVE DES COMMANDES — le test le plus important sur les chiffres.
 *
 * Une preuve qui ne détecte jamais un montant falsifié ne prouve rien. On
 * fabrique donc des écarts (montant modifié, commande absente, statut
 * périmé, devise) et on vérifie qu'ils sont signalés avec la bonne gravité :
 * un montant qui diverge est **critique**, un statut périmé est
 * **information** (c'est normal qu'une commande avance).
 */
const SHOP_ID = "11111111-1111-1111-1111-111111111111";

/**
 * `Intl` insère des espaces insécables fines (U+202F) dans les nombres : on
 * les normalise pour comparer les preuves textuelles.
 */
function plain(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
}

/** Commande Jumia brute (forme de l'API `/orders`). */
function remoteOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmd-1",
    number: "338997922",
    status: "PENDING",
    totalAmount: { currency: "USD", value: 12.34 },
    totalAmountLocal: { currency: "XOF", value: 8200 },
    country: { code: "CI" },
    totalItems: 2,
    packedItems: 1,
    isPrepayment: false,
    hasMultipleStatus: false,
    deliveryOption: "Flat Rate",
    createdAt: "2026-11-20T10:15:00Z",
    updatedAt: "2026-11-21T08:00:00Z",
    ...overrides,
  };
}

/** Ligne locale équivalente à la commande ci-dessus. */
function localOrder(overrides: Partial<LocalOrderRow> = {}): LocalOrderRow {
  return {
    externalOrderId: "cmd-1",
    orderNumber: "338997922",
    status: "PENDING",
    currency: "XOF",
    totalAmountMinor: 8200,
    totalAmountUsdMinor: 1234,
    remoteCreatedAt: new Date("2026-11-20T10:15:00Z"),
    ...overrides,
  };
}

describe("preuve de cohérence des commandes", () => {
  it("valide une commande identique des deux côtés", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder()],
      remoteOrders: [remoteOrder()],
    });
    expect(proof.compared).toBe(1);
    expect(proof.divergent).toBe(0);
    expect(proof.missing).toBe(0);
    expect(proof.outdated).toBe(0);
    expect(proof.local.amountMinor).toBe(proof.remote.amountMinor);
    expect(anomalies.filter((a) => a.severity === "critique")).toHaveLength(0);
  });

  it("détecte un montant modifié (au centime)", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder({ totalAmountMinor: 8201 })],
      remoteOrders: [remoteOrder()],
    });
    expect(proof.divergent).toBe(1);
    const divergence = anomalies.find((a) => a.code === "montant_divergent");
    expect(divergence?.severity).toBe("critique");
    const evidence = plain(divergence?.evidence ?? "");
    expect(evidence).toContain("8 201");
    expect(evidence).toContain("8 200");
    // Le total doit aussi diverger.
    expect(proof.local.amountMinor).not.toBe(proof.remote.amountMinor);
  });

  it("détecte un montant USD modifié", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder({ totalAmountUsdMinor: 1235 })],
      remoteOrders: [remoteOrder()],
    });
    expect(proof.divergent).toBe(1);
    expect(anomalies.some((a) => a.evidence.includes("USD"))).toBe(true);
  });

  it("détecte une commande présente chez Jumia mais absente de la base", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [],
      remoteOrders: [remoteOrder()],
    });
    expect(proof.missing).toBe(1);
    expect(proof.compared).toBe(0);
    const anomaly = anomalies.find((a) => a.code === "commande_manquante");
    expect(anomaly?.severity).toBe("critique");
    expect(anomaly?.evidence).toContain("338997922");
  });

  it("signale un statut périmé comme une information, pas comme une erreur", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder({ status: "PENDING" })],
      remoteOrders: [remoteOrder({ status: "SHIPPED" })],
    });
    expect(proof.outdated).toBe(1);
    expect(proof.divergent).toBe(0);
    const anomaly = anomalies.find((a) => a.code === "commande_non_synchronisee");
    expect(anomaly?.severity).toBe("information");
    expect(anomaly?.evidence).toContain("PENDING");
    expect(anomaly?.evidence).toContain("SHIPPED");
  });

  it("signale une devise différente", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder({ currency: "USD" })],
      remoteOrders: [remoteOrder()],
    });
    expect(proof.divergent).toBe(1);
    expect(anomalies.some((a) => a.evidence.includes("Devise locale"))).toBe(true);
  });

  it("signale une commande enregistrée hors de la fenêtre Jumia", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder()],
      remoteOrders: [],
    });
    expect(proof.extra).toBe(1);
    const anomaly = anomalies.find((a) => a.code === "commande_en_trop");
    expect(anomaly?.severity).toBe("information");
  });

  it("ne signale pas de commande surnuméraire quand la lecture est tronquée", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [localOrder()],
      remoteOrders: [],
      truncated: true,
    });
    expect(proof.extra).toBe(1);
    expect(anomalies.find((a) => a.code === "commande_en_trop")).toBeUndefined();
  });

  it("additionne les totaux de plusieurs commandes", () => {
    const { proof } = compareOrders({
      shopId: SHOP_ID,
      localRows: [
        localOrder(),
        localOrder({ externalOrderId: "cmd-2", orderNumber: "2", totalAmountMinor: 5000 }),
      ],
      remoteOrders: [
        remoteOrder(),
        remoteOrder({ id: "cmd-2", number: "2", totalAmountLocal: { currency: "XOF", value: 5000 } }),
      ],
    });
    expect(proof.compared).toBe(2);
    expect(proof.local.amountMinor).toBe(13200);
    expect(proof.remote.amountMinor).toBe(13200);
    expect(proof.divergent).toBe(0);
  });

  it("écarte une commande Jumia illisible sans l'attribuer", () => {
    const { proof, anomalies } = compareOrders({
      shopId: SHOP_ID,
      localRows: [],
      remoteOrders: [{ status: "PENDING" }],
    });
    expect(proof.compared).toBe(0);
    expect(proof.missing).toBe(0);
    expect(anomalies.length).toBeGreaterThan(0);
  });
});
