import { describe, expect, it } from "vitest";
import { parsePrintLabelsResponse } from "@/lib/jumia/order-items";
import { decodeLabelPdf } from "@/lib/shipment-labels";

/**
 * Réponse `POST /orders/print-labels` — les deux branches sont conservées.
 *
 * Une réponse **partielle** (des colis produits, des articles refusés) doit
 * rester distinguable d'une réussite complète : c'est ce qui permet à
 * l'interface de dire ce qui s'est réellement passé.
 */

const ARTICLE_A = "41ea7c3b-20f0-466d-a095-e6e909298180";
const ARTICLE_B = "c0aa1673-fd99-4f9e-a511-6cefdbdde266";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");

describe("réponse print-labels", () => {
  it("lit les colis produits", () => {
    const outcome = parsePrintLabelsResponse({
      success: {
        labels: [
          {
            orderItemIds: [ARTICLE_A, ARTICLE_B],
            countryCode: "CI",
            trackingNumber: "JG-00D-393842527-9589",
            label: PDF.toString("base64"),
          },
        ],
        total: 2,
      },
      error: { orderItems: [], total: 0 },
    });

    expect(outcome.labels).toHaveLength(1);
    expect(outcome.labels[0]?.orderItemIds).toEqual([ARTICLE_A, ARTICLE_B]);
    expect(outcome.labels[0]?.countryCode).toBe("CI");
    expect(outcome.labels[0]?.trackingNumber).toBe("JG-00D-393842527-9589");
    expect(outcome.successTotal).toBe(2);
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.errorTotal).toBe(0);

    // Le PDF reçu est bien décodable et exploitable.
    const decoded = decodeLabelPdf(outcome.labels[0]!.label);
    expect(decoded).not.toBeNull();
    expect(decoded?.pdf.equals(PDF)).toBe(true);
  });

  it("conserve les refus de Jumia avec leur motif exact", () => {
    const outcome = parsePrintLabelsResponse({
      success: { labels: [], total: 0 },
      error: {
        orderItems: [
          {
            id: ARTICLE_A,
            response: {
              code: "not_allowed_status",
              message:
                "Only order items in pending and ready to ship status can be cancelled",
            },
          },
        ],
        total: 1,
      },
    });

    expect(outcome.labels).toHaveLength(0);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]?.id).toBe(ARTICLE_A);
    expect(outcome.errors[0]?.code).toBe("not_allowed_status");
    expect(outcome.errors[0]?.message).toContain("pending and ready to ship");
    expect(outcome.errorTotal).toBe(1);
  });

  it("distingue une réponse partielle d'une réussite complète", () => {
    const outcome = parsePrintLabelsResponse({
      success: {
        labels: [
          {
            orderItemIds: [ARTICLE_A],
            countryCode: "CI",
            trackingNumber: "JG-1",
            label: PDF.toString("base64"),
          },
        ],
        total: 1,
      },
      error: {
        orderItems: [{ id: ARTICLE_B, response: { code: "x", message: "y" } }],
        total: 1,
      },
    });

    expect(outcome.labels).toHaveLength(1);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.successTotal).toBe(1);
    expect(outcome.errorTotal).toBe(1);
  });

  it("ignore un colis sans PDF exploitable plutôt que de l'inventer", () => {
    const outcome = parsePrintLabelsResponse({
      success: {
        labels: [
          { orderItemIds: [ARTICLE_A], countryCode: "CI", trackingNumber: "JG-1" },
          { orderItemIds: [], countryCode: "CI", label: PDF.toString("base64") },
        ],
        total: 2,
      },
      error: { orderItems: [], total: 0 },
    });

    expect(outcome.labels).toHaveLength(0);
  });

  it("ne suppose rien d'une réponse vide", () => {
    const outcome = parsePrintLabelsResponse(null);
    expect(outcome.labels).toEqual([]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.successTotal).toBe(0);
    expect(outcome.errorTotal).toBe(0);
  });
});
