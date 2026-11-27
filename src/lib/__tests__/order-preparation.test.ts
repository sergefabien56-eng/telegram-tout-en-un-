import { describe, expect, it } from "vitest";
import {
  buildPreparationState,
  isPacked,
  isReadyToShip,
  needsPreparation,
} from "@/lib/order-preparation";

/**
 * Tests unitaires de l'état de préparation.
 *
 * Le cas de référence est **réel** : après un emballage accepté par Jumia
 * (commande 385851761, MaxiShopsCI), l'article reste en `PENDING` mais porte
 * un numéro de suivi. Sans cette distinction, l'interface proposerait de
 * réemballer un article déjà emballé — et Jumia refuserait le lot.
 */

const article = (statut: string, suivi: string | null = null) => ({
  externalItemId: "b2b38de5-108f-43ee-8220-0874db3b2d99",
  status: statut,
  productName: "Article de test",
  sellerSku: "SKU-1",
  trackingNumber: suivi,
  countryCode: "CI",
  shipmentType: "Dropshipping",
});

describe("état d'un article", () => {
  it("un article en attente sans suivi attend encore son emballage", () => {
    expect(needsPreparation("PENDING")).toBe(true);
    expect(needsPreparation("PENDING", null)).toBe(true);
  });

  it("un article en attente déjà emballé n'attend plus d'emballage", () => {
    expect(needsPreparation("PENDING", "DS-FAJ-385851761-8118")).toBe(false);
    expect(isPacked("DS-FAJ-385851761-8118")).toBe(true);
  });

  it("un article prêt à expédier n'attend plus rien", () => {
    expect(needsPreparation("READY_TO_SHIP")).toBe(false);
    expect(needsPreparation("READY_TO_SHIP", "DS-FAJ-385851761-8118")).toBe(false);
    expect(isReadyToShip("READY_TO_SHIP")).toBe(true);
  });

  it("un article clos n'attend plus rien", () => {
    expect(needsPreparation("DELIVERED")).toBe(false);
    expect(needsPreparation("CANCELED")).toBe(false);
    expect(needsPreparation("SHIPPED")).toBe(false);
  });
});

describe("état de préparation d'une commande", () => {
  it("sépare les articles à emballer des articles déjà prêts", () => {
    const etat = buildPreparationState({
      status: "PENDING",
      packedItems: 1,
      totalItems: 2,
      items: [article("PENDING"), article("READY_TO_SHIP", "DS-1")],
    });
    expect(etat.itemsToPrepare).toEqual(["b2b38de5-108f-43ee-8220-0874db3b2d99"]);
    expect(etat.itemsReady).toEqual(["b2b38de5-108f-43ee-8220-0874db3b2d99"]);
  });

  it("ne propose plus d'emballage après un emballage confirmé par Jumia", () => {
    const etat = buildPreparationState({
      status: "PENDING",
      packedItems: 1,
      totalItems: 1,
      items: [article("PENDING", "DS-FAJ-385851761-8118")],
    });
    expect(etat.itemsToPrepare).toHaveLength(0);
    expect(etat.articles[0]?.packed).toBe(true);
    expect(etat.articles[0]?.needsPreparation).toBe(false);
  });

  it("classe la commande en « prête à expédier » quand tous les articles sont emballés", () => {
    const etat = buildPreparationState({
      status: "PENDING",
      packedItems: 1,
      totalItems: 1,
      items: [article("PENDING", "DS-FAJ-385851761-8118")],
    });
    expect(etat.family).toBe("pretes-a-expedier");
  });
});
