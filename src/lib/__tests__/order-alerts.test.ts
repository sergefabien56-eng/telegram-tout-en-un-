import { describe, expect, it } from "vitest";
import {
  computeAlertAction,
  computeOrderAlert,
  computeSyncAlert,
  DEFAUT_DELAI_PREVENTIF_H,
  formaterDuree,
  DEFAUT_SYNC_PERIME_H,
} from "@/lib/order-alerts";

/**
 * Tests unitaires du calcul des alertes de commandes.
 *
 * Ils vérifient les règles **d'affichage** :
 * - une commande récente est signalée comme nouvelle commande ;
 * - l'alerte se renforce quand le seuil préventif est dépassé ;
 * - le seuil de 24 h est présenté comme un repère, **jamais** comme une
 *   heure limite d'annulation ;
 * - l'action proposée suit l'état courant de la commande : une commande
 *   déjà préparée ne propose pas une seconde préparation.
 */

const maintenant = new Date("2026-11-27T12:00:00Z");

function commande(heures: number, options: { deadlineHours?: number } = {}) {
  return computeOrderAlert({
    now: maintenant,
    shopName: "MaxiShopsCI",
    orderNumber: "325542321",
    externalOrderId: "325542321",
    remoteCreatedAt: new Date(maintenant.getTime() - heures * 3_600_000),
    firstSeenAt: new Date(maintenant.getTime() - heures * 3_600_000),
    deadlineHours: options.deadlineHours,
  });
}

describe("alertes de commande : paliers", () => {
  it("signale une commande récente comme nouvelle commande (information)", () => {
    const alerte = commande(2);
    expect(alerte.kind).toBe("nouvelle_commande");
    expect(alerte.priority).toBe("info");
    expect(alerte.title).toContain("Nouvelle commande reçue");
    expect(alerte.body).toContain("MaxiShopsCI");
    expect(alerte.body).toContain("325542321");
  });

  it("bascule en avertissement avant le seuil : à traiter rapidement", () => {
    const alerte = commande(18);
    expect(alerte.kind).toBe("nouvelle_commande");
    expect(alerte.priority).toBe("warning");
    expect(alerte.title).toContain("à traiter rapidement");
  });

  it("renforce l'alerte au-delà du seuil préventif", () => {
    const alerte = commande(30);
    expect(alerte.kind).toBe("delai_24h");
    expect(alerte.priority).toBe("critical");
    expect(alerte.title).toContain("en retard");
    expect(alerte.escalade).toBe(true);
  });

  it("présente le seuil comme préventif, jamais comme une annulation automatique", () => {
    for (const heures of [2, 18, 30, 80]) {
      const alerte = commande(heures);
      expect(alerte.body).toMatch(/seuil/i);
      expect(alerte.body.toLowerCase()).toContain("annulation");
      // Aucune formulation ne doit laisser croire à une annulation acquise.
      expect(alerte.body.toLowerCase()).not.toMatch(/sera annulée|est annulée/);
    }
  });

  it("cite l'heure de réception de la commande", () => {
    const alerte = commande(3);
    expect(alerte.body).toContain("reçue le");
  });

  it("respecte un seuil propre à la boutique", () => {
    const alerte = commande(30, { deadlineHours: 48 });
    // 30 h < 48 h : la commande n'est pas encore en retard, mais elle est
    // déjà au-delà de la moitié du seuil (24 h).
    expect(alerte.kind).toBe("nouvelle_commande");
    expect(alerte.priority).toBe("warning");
    expect(alerte.deadlineHours).toBe(48);

    const enRetard = commande(50, { deadlineHours: 48 });
    expect(enRetard.kind).toBe("delai_24h");
    expect(enRetard.priority).toBe("critical");
  });

  it("utilise 24 h par défaut", () => {
    expect(DEFAUT_DELAI_PREVENTIF_H).toBe(24);
    expect(commande(23).kind).toBe("nouvelle_commande");
    expect(commande(25).kind).toBe("delai_24h");
  });

  it("mesure l'âge sur l'horloge Jumia, pas sur la date de réception", () => {
    // Commande créée il y a 30 h chez Jumia, reçue par l'application il y
    // a 1 h : c'est l'horloge Jumia qui commande l'alerte.
    const alerte = computeOrderAlert({
      now: maintenant,
      shopName: "Boutique",
      orderNumber: null,
      externalOrderId: "EXT-1",
      remoteCreatedAt: new Date(maintenant.getTime() - 30 * 3_600_000),
      firstSeenAt: new Date(maintenant.getTime() - 1 * 3_600_000),
    });
    expect(alerte.kind).toBe("delai_24h");
    expect(alerte.ageHours).toBeCloseTo(30, 1);
  });
});

describe("alertes de synchronisation", () => {
  const base = {
    shopName: "NKSF SHOP",
    syncInProgress: false,
    now: maintenant,
  };

  it("signale une synchronisation en échec", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: "error",
      lastSyncAt: new Date(maintenant.getTime() - 3_600_000),
    });
    expect(alerte?.kind).toBe("synchronisation");
    expect(alerte?.priority).toBe("critical");
    expect(alerte?.body.toLowerCase()).toContain("échoué");
  });

  it("signale une synchronisation partielle", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: "partial",
      lastSyncAt: new Date(maintenant.getTime() - 3_600_000),
    });
    expect(alerte?.priority).toBe("warning");
  });

  it("signale des données en retard quand la relecture est ancienne", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: "ok",
      lastSyncAt: new Date(maintenant.getTime() - (DEFAUT_SYNC_PERIME_H + 1) * 3_600_000),
    });
    expect(alerte?.kind).toBe("synchronisation");
    expect(alerte?.priority).toBe("warning");
    expect(alerte?.body.toLowerCase()).toContain("retard");
  });

  it("n'alerte pas quand la synchronisation est à jour", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: "ok",
      lastSyncAt: new Date(maintenant.getTime() - 60_000),
    });
    expect(alerte).toBeNull();
  });

  it("signale une boutique jamais synchronisée", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: null,
      lastSyncAt: null,
    });
    expect(alerte?.kind).toBe("synchronisation");
    expect(alerte?.body.toLowerCase()).toContain("jamais");
  });

  it("n'alerte pas une boutique non rattachée à Jumia : il n'y a rien à relire", () => {
    const alerte = computeSyncAlert({
      ...base,
      lastSyncStatus: null,
      lastSyncAt: null,
      attached: false,
    });
    expect(alerte).toBeNull();
  });
});

describe("action proposée par l'alerte", () => {
  it("propose « Voir et préparer » pour une commande en attente", () => {
    const action = computeAlertAction({
      kind: "nouvelle_commande",
      family: "en-attente",
      orderId: "11111111-1111-4111-8111-111111111111",
      shopId: "22222222-2222-4222-8222-222222222222",
    });
    expect(action.kind).toBe("prepare");
    expect(action.label).toBe("Voir et préparer");
    expect(action.href).toContain("/commandes/");
  });

  it("propose une action adaptée — pas une seconde préparation — si la commande est prête", () => {
    const action = computeAlertAction({
      kind: "nouvelle_commande",
      family: "pretes-a-expedier",
      orderId: "11111111-1111-4111-8111-111111111111",
      shopId: "22222222-2222-4222-8222-222222222222",
    });
    expect(action.kind).toBe("view");
    expect(action.label).toBe("Voir la commande");
    expect(action.label).not.toContain("préparer");
  });

  it("renvoie vers la vérification de synchronisation pour une alerte de données", () => {
    const action = computeAlertAction({
      kind: "synchronisation",
      family: null,
      orderId: null,
      shopId: "22222222-2222-4222-8222-222222222222",
    });
    expect(action.kind).toBe("sync");
    expect(action.href).toContain("/commandes");
  });
});

describe("formatage des durées", () => {
  it("reste lisible pour les petites et les grandes durées", () => {
    expect(formaterDuree(0.5)).toBe("30 min");
    expect(formaterDuree(2)).toBe("2 h");
    expect(formaterDuree(2.5)).toBe("2 h 30");
    expect(formaterDuree(50)).toBe("2 j 2 h");
  });
});
