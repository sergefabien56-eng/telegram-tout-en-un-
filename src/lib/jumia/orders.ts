import { jumiaGet, throttle } from "./request";

/** Une page de commandes GOP. */
export type OrdersPage = {
  orders: unknown[];
  nextToken: string | null;
  isLastPage: boolean;
};

/**
 * Page unique de commandes (`GET /orders`).
 *
 * `shopId` filtre sur la boutique distante (usage mastershop) : on ne récupère
 * ainsi que les commandes de la boutique rattachée.
 */
export async function fetchOrdersPage(params: {
  shopId?: string;
  /** Compte vendeur Jumia à utiliser (multi-comptes). */
  accountId?: string;
  createdAfter: string;
  createdBefore: string;
  size?: number;
  sort?: "ASC" | "DESC";
  token?: string | null;
}): Promise<OrdersPage> {
  const response = await jumiaGet("/orders", {
    shopId: params.shopId,
    createdAfter: params.createdAfter,
    createdBefore: params.createdBefore,
    size: params.size ?? 200,
    sort: params.sort ?? "DESC",
    token: params.token ?? undefined,
  }, params.accountId ? { accountId: params.accountId } : undefined);

  if (!response.ok) {
    return Promise.reject(
      new Error(`Jumia a refusé la lecture des commandes (HTTP ${response.status}).`),
    );
  }

  const body = (await response.json().catch(() => null)) as {
    orders?: unknown[];
    nextToken?: string | null;
    isLastPage?: boolean;
  } | null;

  return {
    orders: Array.isArray(body?.orders) ? body.orders : [],
    nextToken: typeof body?.nextToken === "string" && body.nextToken ? body.nextToken : null,
    isLastPage: body?.isLastPage !== false && !body?.nextToken,
  };
}

/**
 * Parcourt toutes les pages d'une période, dans la limite de `maxPages`
 * (protection contre une boucle infinie et le quota Jumia).
 */
export async function fetchAllOrderPages(params: {
  shopId?: string;
  accountId?: string;
  createdAfter: string;
  createdBefore: string;
  size?: number;
  sort?: "ASC" | "DESC";
  maxPages?: number;
}): Promise<{ orders: unknown[]; pages: number; truncated: boolean }> {
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 5, 20));
  const collected: unknown[] = [];
  let token: string | null = null;
  let pages = 0;
  let truncated = false;

  for (; pages < maxPages; pages += 1) {
    const page = await fetchOrdersPage({
      ...params,
      token,
    });
    collected.push(...page.orders);
    if (page.isLastPage || !page.nextToken) {
      return { orders: collected, pages: pages + 1, truncated };
    }
    token = page.nextToken;
    // L'intervalle minimal est déjà appliqué dans `jumiaGet` ; ce supplément
    // évite de réinitialiser la fenêtre de 200 requêtes/minute.
    await throttle();
  }

  truncated = true;
  return { orders: collected, pages, truncated };
}
