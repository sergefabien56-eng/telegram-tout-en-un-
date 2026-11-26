import { describe, expect, it } from "vitest";
import {
  familyFromItemStatuses,
  hasMultipleStatuses,
  isPartiallyPacked,
  isPreparationConfirmed,
  normalizeOrderStatus,
  orderFamily,
  orderStatusLabel,
  ORDER_STATUS_OPTIONS,
} from "@/lib/order-status";

/**
 * Classification des commandes — cas réels mesurés sur la base du projet.
 *
 * Ces tests fixent les définitions announcements dans
 * `docs/plan-refonte-ventes-commandes.md` § 3.1.
 */
describe("normalisation des statuts Jumia", () => {
  it("ignore casse, espaces, tirets et soubassements", () => {
    expect(normalizeOrderStatus("READY_TO_SHIP")).toBe("readytoship");
    expect(normalizeOrderStatus("Ready To Ship")).toBe("readytoship");
    expect(normalizeOrderStatus("ready-to-ship")).toBe("readytoship");
    expect(normalizeOrderStatus("  SHIPPED  ")).toBe("shipped");
  });

  it("donne un libellé lisible sans inventer de statut", () => {
    expect(orderStatusLabel("READY_TO_SHIP")).toBe("Prête à expédier");
    expect(orderStatusLabel("DELIVERED")).toBe("Livrée");
    expect(orderStatusLabel("CANCELED")).toBe("Annulée");
    expect(orderStatusLabel("FAILED")).toBe("Échec de livraison");
    // Un statut inconnu garde sa valeur d'origine : rien n'est inventé.
    expect(orderStatusLabel("STATUT_INCONNU")).toBe("STATUT_INCONNU");
  });
});

describe("préparation confirmée", () => {
  it("exige tous les articles emballés", () => {
    expect(isPreparationConfirmed({ status: "PENDING", packedItems: 0, totalItems: 2 })).toBe(
      false,
    );
    expect(isPreparationConfirmed({ status: "PENDING", packedItems: 1, totalItems: 2 })).toBe(
      false,
    );
    expect(isPreparationConfirmed({ status: "PENDING", packedItems: 2, totalItems: 2 })).toBe(true);
    expect(isPreparationConfirmed({ status: "READY_TO_SHIP", packedItems: 3, totalItems: 3 })).toBe(
      true,
    );
  });

  it("ne confond pas une commande sans article avec une commande préparée", () => {
    expect(isPreparationConfirmed({ status: "PENDING", packedItems: 0, totalItems: 0 })).toBe(
      false,
    );
  });

  it("signale la préparation partielle", () => {
    expect(isPartiallyPacked({ status: "Multiple Status", packedItems: 1, totalItems: 2 })).toBe(
      true,
    );
    expect(isPartiallyPacked({ status: "PENDING", packedItems: 0, totalItems: 2 })).toBe(false);
    expect(isPartiallyPacked({ status: "PENDING", packedItems: 2, totalItems: 2 })).toBe(false);
  });
});

describe("famille d'une commande", () => {
  it("classe les statuts réellement observés", () => {
    expect(orderFamily({ status: "DELIVERED" })).toBe("livrees");
    expect(orderFamily({ status: "CANCELED" })).toBe("annulees");
    expect(orderFamily({ status: "FAILED" })).toBe("echec-livraison");
    expect(orderFamily({ status: "SHIPPED" })).toBe("expediees");
    expect(orderFamily({ status: "READY_TO_SHIP", packedItems: 3, totalItems: 3 })).toBe(
      "pretes-a-expedier",
    );
    expect(orderFamily({ status: "PENDING", packedItems: 0, totalItems: 1 })).toBe("en-attente");
  });

  it("distingue annulation et échec de livraison", () => {
    // Deux situations très différentes : une annulation (client ou vendeur)
    // et une livraison ratée. Les confondre fausserait le suivi.
    expect(orderFamily({ status: "CANCELED" })).not.toBe(orderFamily({ status: "FAILED" }));
  });

  it("ne classe jamais une commande multi-statuts comme prête", () => {
    // Commande réelle : 1 article préparé sur 2.
    const commande = { status: "Multiple Status", packedItems: 1, totalItems: 2 };
    expect(orderFamily(commande)).toBe("en-attente");
    expect(hasMultipleStatuses(commande)).toBe(true);
    expect(isPreparationConfirmed(commande)).toBe(false);
  });

  it("regroupe tous les retours, quel que soit le motif", () => {
    expect(orderFamily({ status: "RETURNED" })).toBe("retours");
    expect(orderFamily({ status: "REFUNDED" })).toBe("retours");
    expect(orderFamily({ status: "RETURN_REQUESTED" })).toBe("retours");
    expect(orderFamily({ status: "RMA" })).toBe("retours");
  });

  it("ne laisse jamais une commande livrée ou annulée passer pour « en attente »", () => {
    expect(orderFamily({ status: "DELIVERED", packedItems: 0, totalItems: 1 })).toBe("livrees");
    expect(orderFamily({ status: "CANCELED", packedItems: 0, totalItems: 1 })).toBe("annulees");
  });

  it("traite un statut inconnu comme non préparé (prudence)", () => {
    expect(orderFamily({ status: "STATUT_INCONNU", packedItems: 0, totalItems: 1 })).toBe(
      "en-attente",
    );
  });
});

describe("commande à statut multiple : la décision revient aux articles", () => {
  it("ne présente pas comme « en attente » une commande dont tous les articles sont clos", () => {
    // Cas réel : MaxiShopsCI, commande 325542321 (06/11/2026). Un article
    // annulé (« Duplicated order »), un article livré le 07/11. Il ne
    // reste rien à préparer : la commande n'a rien à faire apparaître dans
    // « À traiter », alors que `packedItems = 1` sur 2 articles laissait
    // croire le contraire.
    const commande = {
      status: "Multiple Status",
      packedItems: 1,
      totalItems: 2,
      itemStatuses: ["CANCELED", "DELIVERED"],
    };
    expect(orderFamily(commande)).toBe("livrees");
    expect(orderFamily(commande)).not.toBe("en-attente");
  });

  it("classe une commande dont un article reste à préparer", () => {
    expect(
      orderFamily({
        status: "Multiple Status",
        packedItems: 1,
        totalItems: 2,
        itemStatuses: ["DELIVERED", "PENDING"],
      }),
    ).toBe("en-attente");
  });

  it("classe « prête à expédier » quand tous les articles restants le sont", () => {
    expect(
      orderFamily({
        status: "Multiple Status",
        packedItems: 1,
        totalItems: 2,
        itemStatuses: ["SHIPPED", "READY_TO_SHIP"],
      }),
    ).toBe("pretes-a-expedier");
  });

  it("classe selon l'article le plus avancé quand tout est clos", () => {
    const cas: [string[], string][] = [
      [["SHIPPED", "CANCELED"], "expediees"],
      [["FAILED", "CANCELED"], "echec-livraison"],
      [["RETURNED", "CANCELED"], "retours"],
      [["CANCELED", "CANCELED"], "annulees"],
      [["DELIVERED", "SHIPPED"], "livrees"],
    ];
    for (const [statuts, attendue] of cas) {
      expect(familyFromItemStatuses(statuts)).toBe(attendue);
      expect(
        orderFamily({
          status: "Multiple Status",
          packedItems: 1,
          totalItems: statuts.length,
          itemStatuses: statuts,
        }),
      ).toBe(attendue);
    }
  });

  it("ne conclut pas sans information sur les articles", () => {
    // Aucun article connu : on ne peut rien conclure, on garde la prudence.
    expect(familyFromItemStatuses([])).toBeNull();
    expect(familyFromItemStatuses(null)).toBeNull();
    // Statuts d'articles inconnus : aucune conclusion non plus.
    expect(familyFromItemStatuses(["STATUT_INCONNU"])).toBeNull();
    // Et l'ordre reste « en attente », sans information exploitable.
    expect(
      orderFamily({ status: "Multiple Status", packedItems: 1, totalItems: 2, itemStatuses: [] }),
    ).toBe("en-attente");
  });

  it("ignore les statuts d'articles quand le statut global est connu", () => {
    // Le statut global prime : une commande livrée reste livrée.
    expect(
      orderFamily({
        status: "DELIVERED",
        packedItems: 0,
        totalItems: 2,
        itemStatuses: ["PENDING", "PENDING"],
      }),
    ).toBe("livrees");
  });
});

describe("liste des statuts proposés au filtre", () => {
  it("ne propose que des statuts observés en base", () => {
    const valeurs = ORDER_STATUS_OPTIONS.map((option) => option.value);
    expect(valeurs).toContain("PENDING");
    expect(valeurs).toContain("READY_TO_SHIP");
    expect(valeurs).toContain("FAILED");
    expect(valeurs).toContain("Multiple Status");
    // Aucun statut qui n'ait jamais été observé.
    expect(valeurs).not.toContain("CREATED");
    expect(valeurs).not.toContain("PROCESSING");
  });

  it("donne un libellé à chaque statut", () => {
    for (const option of ORDER_STATUS_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});
