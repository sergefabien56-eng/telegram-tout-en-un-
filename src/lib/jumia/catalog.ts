import { jumiaGet } from "./request";

/** Une page du catalogue GPM (`GET /catalog/products`). */
export async function fetchProductPage(params: {
  shopId?: string;
  /** Compte vendeur Jumia à utiliser (multi-comptes). */
  accountId?: string;
  size?: number;
  token?: string | null;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<{ products: unknown[]; nextToken: string | null; isLastPage: boolean }> {
  const response = await jumiaGet("/catalog/products", {
    shopId: params.shopId,
    size: params.size ?? 100,
    token: params.token ?? undefined,
    status: params.status,
    // On récupère d'abord les plus récents : utile quand la limite de pages
    // tronque la fin de la liste.
    latestFirst: true,
  }, params.accountId ? { accountId: params.accountId } : undefined);

  if (!response.ok) {
    return Promise.reject(
      new Error(`Jumia a refusé la lecture du catalogue (HTTP ${response.status}).`),
    );
  }

  const body = (await response.json().catch(() => null)) as {
    products?: unknown[];
    nextToken?: string | null;
    isLastPage?: boolean;
  } | null;

  return {
    products: Array.isArray(body?.products) ? body.products : [],
    nextToken: typeof body?.nextToken === "string" && body.nextToken ? body.nextToken : null,
    isLastPage: body?.isLastPage !== false && !body?.nextToken,
  };
}

/** Parcourt le catalogue, dans la limite de `maxPages`. */
export async function fetchAllProductPages(params: {
  shopId?: string;
  accountId?: string;
  size?: number;
  maxPages?: number;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<{ products: unknown[]; pages: number; truncated: boolean }> {
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 5, 20));
  const collected: unknown[] = [];
  let token: string | null = null;

  for (let pages = 0; pages < maxPages; pages += 1) {
    const page = await fetchProductPage({ ...params, token });
    collected.push(...page.products);
    if (page.isLastPage || !page.nextToken) {
      return { products: collected, pages: pages + 1, truncated: false };
    }
    token = page.nextToken;
  }

  return { products: collected, pages: maxPages, truncated: true };
}

/** Une page de stocks (`GET /catalog/stock`). */
export async function fetchStockPage(params: {
  /** Compte vendeur Jumia à utiliser (multi-comptes). */
  accountId?: string;
  size?: number;
  token?: string | null;
}): Promise<{ stocks: unknown[]; nextToken: string | null; isLastPage: boolean }> {
  const response = await jumiaGet(
    "/catalog/stock",
    {
      size: params.size ?? 100,
      token: params.token ?? undefined,
    },
    params.accountId ? { accountId: params.accountId } : undefined,
  );

  if (!response.ok) {
    return Promise.reject(
      new Error(`Jumia a refusé la lecture des stocks (HTTP ${response.status}).`),
    );
  }

  const body = (await response.json().catch(() => null)) as {
    products?: unknown[];
    nextToken?: string | null;
    isLastPage?: boolean;
  } | null;

  return {
    stocks: Array.isArray(body?.products) ? body.products : [],
    nextToken: typeof body?.nextToken === "string" && body.nextToken ? body.nextToken : null,
    isLastPage: body?.isLastPage !== false && !body?.nextToken,
  };
}

/** Parcourt les stocks, dans la limite de `maxPages`. */
export async function fetchAllStockPages(params: {
  accountId?: string;
  size?: number;
  maxPages?: number;
}): Promise<{ stocks: unknown[]; pages: number; truncated: boolean }> {
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 5, 20));
  const collected: unknown[] = [];
  let token: string | null = null;

  for (let pages = 0; pages < maxPages; pages += 1) {
    const page = await fetchStockPage({ ...params, token });
    collected.push(...page.stocks);
    if (page.isLastPage || !page.nextToken) {
      return { stocks: collected, pages: pages + 1, truncated: false };
    }
    token = page.nextToken;
  }

  return { stocks: collected, pages: maxPages, truncated: true };
}
