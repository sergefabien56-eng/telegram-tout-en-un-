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

  it("ne mêle jamais création et mise à jour dans la même requête", async () => {
    // L'API Jumia refuse (HTTP 422) de filtrer par création ET par mise à
    // jour dans le même appel : « Filtering by both Created and Updated at
    // the same time not allowed ».
    const { requests, module } = await withStubbedJumia([{ orders: [] }, { orders: [] }]);

    await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01",
      createdBefore: "2026-11-10",
      updatedAfter: "2026-01-01",
      updatedBefore: "2026-11-10",
      size: 200,
      maxPages: 5,
    });

    // Deux requêtes distinctes : l'une par création, l'autre par mise à jour.
    expect(requests).toHaveLength(2);

    for (const request of requests) {
      const parCreation = request.params.createdAfter !== undefined;
      const parMiseAJour = request.params.updatedAfter !== undefined;
      expect(parCreation && parMiseAJour).toBe(false);
    }

    expect(requests[0]?.params.createdAfter).toBe("2026-11-01");
    expect(requests[0]?.params.updatedAfter).toBeUndefined();
    expect(requests[1]?.params.updatedAfter).toBe("2026-01-01");
    expect(requests[1]?.params.createdAfter).toBeUndefined();
  });

  it("fusionne les deux fenêtres sans compter deux fois la même commande", async () => {
    const { module } = await withStubbedJumia([
      { orders: [{ id: "a", status: "CREATED" }, { id: "b" }] },
      { orders: [{ id: "a", status: "SHIPPED" }, { id: "c" }] },
    ]);

    const result = await module.fetchAllOrderPages({
      shopId: "shop-1",
      createdAfter: "2026-11-01",
      createdBefore: "2026-11-10",
      updatedAfter: "2026-01-01",
      updatedBefore: "2026-11-10",
      size: 200,
      maxPages: 5,
    });

    // « a » est lue dans les deux fenêtres : elle n'est comptée qu'une fois,
    // dans son état le plus récent (celui de la lecture « mise à jour »).
    expect(result.orders).toHaveLength(3);
    const a = result.orders.find((order) => (order as { id?: string }).id === "a") as {
      status?: string;
    };
    expect(a?.status).toBe("SHIPPED");
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

describe("GET /orders — refus de l'API", () => {
  it("affiche le message de Jumia, pas seulement le code HTTP", async () => {
    vi.doMock("@/lib/jumia/request", () => ({
      jumiaGet: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message:
              "Filtering by both Created and Updated at the same time not allowed, please use only one of them per request.",
            status: 422,
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }),
      throttle: vi.fn(async () => undefined),
    }));
    const ordersModule = await import("@/lib/jumia/orders");

    await expect(
      ordersModule.fetchAllOrderPages({
        shopId: "shop-1",
        createdAfter: "2026-11-01",
        createdBefore: "2026-11-10",
        size: 200,
        maxPages: 5,
      }),
    ).rejects.toThrow(/HTTP 422/);
    await expect(
      ordersModule.fetchAllOrderPages({
        shopId: "shop-1",
        createdAfter: "2026-11-01",
        createdBefore: "2026-11-10",
        size: 200,
        maxPages: 5,
      }),
    ).rejects.toThrow(/Filtering by both Created and Updated/);
  });
});
