import { afterEach, describe, expect, it, vi } from "vitest";
import { JUMIA_TOKEN_URL } from "@/lib/jumia/client";

/**
 * Pagination et filtres de `GET /orders`.
 *
 * Le test **n'appelle jamais Jumia** : la couche HTTP est simulée, on
 * vérifie exactement ce qui serait envoyé. Aucun jeton n'est exposé : on
 * contrôle au passage que le jeton d'accès n'apparaît dans aucun paramètre
 * d'URL.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/lib/jumia/request");
});

type Page = { orders: unknown[]; nextToken?: string | null };

/** Simule la couche HTTP de Jumia et renvoie les requêtes préparées. */
async function withStubbedJumia(pages: Page[]) {
  const requests: { params: Record<string, unknown> }[] = [];
  let call = 0;
  vi.doMock("@/lib/jumia/request", () => ({
    jumiaGet: vi.fn(async (_path: string, params: Record<string, unknown>) => {
      requests.push({ params });
      const page = pages[Math.min(call, pages.length - 1)] ?? { orders: [] };
      call += 1;
      return new Response(
        JSON.stringify({
          orders: page.orders,
          ...(page.nextToken ? { nextToken: page.nextToken } : {}),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
    throttle: vi.fn(async () => undefined),
  }));
  return { requests, module: await import("@/lib/jumia/orders") };
}

describe("GET /orders — filtres et pagination", () => {
  it("envoie la période de création et suit le curseur de pagination", async () => {
    const { requests, module } = await withStubbedJumia([
      { orders: [{ id: "a" }], nextToken: "token-1" },
      { orders: [{ id: "b" }], nextToken: null },
    ]);

    const result = await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01T00:00:00Z",
      createdBefore: "2026-11-10T23:59:59Z",
      size: 200,
      maxPages: 5,
    });

    expect(result.orders).toHaveLength(2);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);

    // Première page : période + taille de page.
    expect(requests[0]?.params.createdAfter).toBe("2026-11-01T00:00:00Z");
    expect(requests[0]?.params.createdBefore).toBe("2026-11-10T23:59:59Z");
    expect(requests[0]?.params.size).toBe(200);
    expect(requests[0]?.params.token).toBeUndefined();
    // Deuxième page : le curseur reçu est transmis.
    expect(requests[1]?.params.token).toBe("token-1");
  });

  it("envoie la fenêtre de mise à jour pour relire les commandes anciennes", async () => {
    const { requests, module } = await withStubbedJumia([{ orders: [] }]);

    await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01T00:00:00Z",
      createdBefore: "2026-11-10T23:59:59Z",
      updatedAfter: "2026-01-01T00:00:00Z",
      updatedBefore: "2026-11-10T23:59:59Z",
      size: 200,
      maxPages: 5,
    });

    expect(requests[0]?.params.updatedAfter).toBe("2026-01-01T00:00:00Z");
    expect(requests[0]?.params.updatedBefore).toBe("2026-11-10T23:59:59Z");
  });

  it("signale une lecture tronquée quand la limite de pages est atteinte", async () => {
    // Chaque page renvoie un curseur : la pagination ne se termine jamais.
    const { requests, module } = await withStubbedJumia([
      { orders: [{ id: "a" }], nextToken: "t1" },
      { orders: [{ id: "b" }], nextToken: "t2" },
      { orders: [{ id: "c" }], nextToken: "t3" },
    ]);

    const result = await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01T00:00:00Z",
      createdBefore: "2026-11-10T23:59:59Z",
      size: 200,
      maxPages: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.pages).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it("n'expose jamais le jeton d'accès dans les paramètres de la requête", async () => {
    const { requests, module } = await withStubbedJumia([{ orders: [] }]);

    await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01T00:00:00Z",
      createdBefore: "2026-11-10T23:59:59Z",
      size: 200,
      maxPages: 5,
    });

    // URL réellement construite, comme le fait la couche HTTP.
    const url = new URL(`${JUMIA_TOKEN_URL}/orders`);
    for (const [key, value] of Object.entries(requests[0]?.params ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    for (const forbidden of ["access_token", "refresh_token", "secret", "authorization"]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
    expect(url.search).not.toContain("Bearer");
  });
});
