import { describe, expect, it } from "vitest";
import {
  describeJumiaRefusal,
  parsePreparationResponse,
} from "@/lib/jumia/order-preparation";

/**
 * Tests du décodage des réponses Jumia (`pack` et `ready-to-ship`).
 *
 * Ces réponses sont **partielles par nature** : un `201` peut contenir des
 * articles réussis **et** des articles refusés. Le décodage doit les
 * distinguer, article par article, sans jamais fusionner les deux.
 *
 * Les enveloppes utilisées ici sont conformes à la structure documentée par
 * Jumia (`success.packages[]` / `error.orderItems[]`) : ce sont des
 * **exemples de format**, pas des données de production.
 */

const ARTICLE_A = "41ea7c3b-20f0-466d-a095-e6e909298180";
const ARTICLE_B = "c0aa1673-fd99-4f9e-a511-6cefdbdde266";
const ARTICLE_C = "ddf7113b-2796-4641-86ef-c4c7083d9b59";

describe("réponse Jumia : succès complet", () => {
  it("déplie les colis en articles réussis", () => {
    const corps = {
      success: {
        packages: [
          {
            orderItems: [ARTICLE_A, ARTICLE_B],
            countryCode: "CI",
            trackingNumber: "JG-00D-393842527-9589",
          },
        ],
        total: 2,
      },
      error: { orderItems: [], total: 0 },
    };
    const resultat = parsePreparationResponse(corps, 201);
    expect(resultat.succeeded).toHaveLength(2);
    expect(resultat.failed).toHaveLength(0);
    expect(resultat.succeeded[0]?.id).toBe(ARTICLE_A);
    expect(resultat.succeeded[0]?.trackingNumber).toBe("JG-00D-393842527-9589");
    expect(resultat.succeeded[0]?.countryCode).toBe("CI");
    expect(resultat.succeeded[1]?.id).toBe(ARTICLE_B);
  });
});

describe("réponse Jumia : réussite partielle", () => {
  it("sépare les articles acceptés des articles refusés", () => {
    const corps = {
      success: {
        packages: [
          { orderItems: [ARTICLE_A], countryCode: "CI", trackingNumber: "JG-00D-1" },
        ],
        total: 1,
      },
      error: {
        orderItems: [
          {
            id: ARTICLE_B,
            response: {
              code: "not_allowed_status",
              message: "Only order items in pending and ready to ship status can be cancelled",
            },
          },
        ],
        total: 1,
      },
    };
    const resultat = parsePreparationResponse(corps, 201);
    expect(resultat.succeeded).toHaveLength(1);
    expect(resultat.succeeded[0]?.id).toBe(ARTICLE_A);
    expect(resultat.failed).toHaveLength(1);
    expect(resultat.failed[0]?.id).toBe(ARTICLE_B);
    expect(resultat.failed[0]?.code).toBe("not_allowed_status");
    expect(resultat.failed[0]?.ok).toBe(false);
  });

  it("refuse un identifiant d'article absent", () => {
    const corps = {
      success: { packages: [], total: 0 },
      error: { orderItems: [{ response: { code: "x", message: "y" } }], total: 1 },
    };
    const resultat = parsePreparationResponse(corps, 201);
    expect(resultat.failed).toHaveLength(0);
  });
});

describe("réponse Jumia : refus complet", () => {
  it("rapporte tous les refus avec leur code", () => {
    const corps = {
      success: { packages: [], total: 0 },
      error: {
        orderItems: [
          { id: ARTICLE_A, response: { code: "not_allowed_status", message: "Refus A" } },
          { id: ARTICLE_B, response: { code: "different_country", message: "Refus B" } },
        ],
        total: 2,
      },
    };
    const resultat = parsePreparationResponse(corps, 201);
    expect(resultat.succeeded).toHaveLength(0);
    expect(resultat.failed).toHaveLength(2);
    expect(resultat.failed.map((row) => row.code)).toEqual([
      "not_allowed_status",
      "different_country",
    ]);
    expect(describeJumiaRefusal(resultat)).toContain("Refus A");
  });
});

describe("réponse Jumia : cas dégradés", () => {
  it("ne plante pas sur une enveloppe vide", () => {
    const resultat = parsePreparationResponse(null, 500);
    expect(resultat.succeeded).toHaveLength(0);
    expect(resultat.failed).toHaveLength(0);
    expect(resultat.httpStatus).toBe(500);
  });

  it("remonte un message global quand Jumia refuse l'appel entier", () => {
    const corps = { error: { code: "invalid_request", message: "Shipment provider not found" } };
    const resultat = parsePreparationResponse(corps, 400);
    expect(resultat.error).toBe("Shipment provider not found");
    expect(resultat.code).toBe("invalid_request");
    expect(describeJumiaRefusal(resultat)).toBe("Shipment provider not found");
  });

  it("donne un message par défaut quand Jumia n'explique pas", () => {
    const resultat = parsePreparationResponse(
      { error: { orderItems: [{ id: ARTICLE_C, response: {} }], total: 1 } },
      201,
    );
    expect(resultat.failed[0]?.message).toBeTruthy();
    expect(resultat.failed[0]?.code).toBe("erreur");
  });
});
