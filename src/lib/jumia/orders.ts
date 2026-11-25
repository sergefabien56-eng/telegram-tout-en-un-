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
/**
 * Paramètres de la requête `GET /orders` — fonction **pure**.
 *
 * Les filtres de création (`createdAfter`/`createdBefore`) et de mise à jour
 * (`updatedAfter`/`updatedBefore`) sont exposés séparément : une
 * synchronisation limitée à la création ne verrait jamais les changements de
 * statut des commandes plus anciennes.
 */
export function buildOrderQuery(params: {
  shopId?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  size?: number;
  sort?: "ASC" | "DESC";
  token?: string | null;
}): Record<string, string | number | boolean | undefined> {
  return {
    shopId: params.shopId,
    createdAfter: params.createdAfter,
    createdBefore: params.createdBefore,
    updatedAfter: params.updatedAfter,
    updatedBefore: params.updatedBefore,
    size: params.size ?? 200,
    sort: params.sort ?? "DESC",
    token: params.token ?? undefined,
  };
}

export async function fetchOrdersPage(params: {
  shopId?: string;
  /** Compte vendeur Jumia à utiliser (multi-comptes). */
  accountId?: string;
  createdAfter?: string;
  createdBefore?: string;
  /**
   * Fenêtre de **mise à jour** : c'est elle qui permet de relire les
   * commandes plus anciennes dont le statut a changé (une synchronisation
   * limitée à `createdAfter` ne verrait jamais ces changements).
   */
  updatedAfter?: string;
  updatedBefore?: string;
  size?: number;
  sort?: "ASC" | "DESC";
  token?: string | null;
}): Promise<OrdersPage> {
  const response = await jumiaGet(
    "/orders",
    buildOrderQuery(params),
    params.accountId ? { accountId: params.accountId } : undefined,
  );

  if (!response.ok) {
    const detail = await readJumiaMessage(response);
    return Promise.reject(
      new Error(
        `Jumia a refusé la lecture des commandes (HTTP ${response.status})${detail ? ` : ${detail}` : "."}`,
      ),
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
 * Message d'erreur renvoyé par Jumia.
 *
 * Sans lui, l'interface ne montrait que « HTTP 422 » : impossible de savoir
 * que la cause était, par exemple, l'interdiction de filtrer par création et
 * par mise à jour dans la même requête.
 */
async function readJumiaMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown } | null;
    const message = body?.message ?? body?.error;
    if (typeof message === "string" && message) return message.slice(0, 300);
  } catch {
    // Réponse non JSON : on reste silencieux.
  }
  return null;
}

/**
 * Fenêtres de lecture.
 *
 * **Une seule famille de filtres par requête** : Jumia refuse (HTTP 422)
 * de filtrer par création *et* par mise à jour dans le même appel
 * (« Filtering by both Created and Updated at the same time not allowed »).
 * On lit donc la création, puis la mise à jour, et on fusionne.
 */
type OrderWindow = {
  label: "création" | "mise à jour";
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
};

export function buildOrderWindows(params: {
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}): OrderWindow[] {
  const windows: OrderWindow[] = [];
  if (params.createdAfter || params.createdBefore) {
    windows.push({
      label: "création",
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
    });
  }
  if (params.updatedAfter || params.updatedBefore) {
    windows.push({
      label: "mise à jour",
      updatedAfter: params.updatedAfter,
      updatedBefore: params.updatedBefore,
    });
  }
  // Sans aucune borne : une lecture globale, telle que Jumia l'accepte.
  if (windows.length === 0) windows.push({ label: "création" });
  return windows;
}

/**
 * Parcourt toutes les pages d'une période, dans la limite de `maxPages`
 * (protection contre une boucle infinie et le quota Jumia).
 *
 * Quand les deux fenêtres (création **et** mise à jour) sont demandées, deux
 * lectures distinctes sont faites — l'API n'en accepte qu'une par requête —
 * et les résultats sont fusionnés : une commande lue dans les deux fenêtres
 * n'est comptée qu'une fois, dans son état le plus récent.
 */
export async function fetchAllOrderPages(params: {
  shopId?: string;
  accountId?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  size?: number;
  sort?: "ASC" | "DESC";
  maxPages?: number;
}): Promise<{ orders: unknown[]; pages: number; truncated: boolean }> {
  const maxPages = Math.max(1, Math.min(params.maxPages ?? 5, 20));
  const windows = buildOrderWindows(params);

  const parId = new Map<string, unknown>();
  const sansId: unknown[] = [];
  let pages = 0;
  let truncated = false;

  for (const window of windows) {
    const collected: unknown[] = [];
    let token: string | null = null;
    let windowPages = 0;
    let reachedLastPage = false;

    while (windowPages < maxPages) {
      // Les filtres sont posés **explicitement** : une requête ne porte jamais
      // à la fois une borne de création et une borne de mise à jour (l'API
      // le refuse en 422).
      const page = await fetchOrdersPage({
        shopId: params.shopId,
        accountId: params.accountId,
        size: params.size,
        sort: params.sort,
        createdAfter: window.createdAfter,
        createdBefore: window.createdBefore,
        updatedAfter: window.updatedAfter,
        updatedBefore: window.updatedBefore,
        token,
      });
      collected.push(...page.orders);
      windowPages += 1;
      if (page.isLastPage || !page.nextToken) {
        reachedLastPage = true;
        break;
      }
      token = page.nextToken;
      // L'intervalle minimal est déjà appliqué dans `jumiaGet` ; ce supplément
      // évite de réinitialiser la fenêtre de 200 requêtes/minute.
      await throttle();
    }

    if (!reachedLastPage) {
      // La limite de pages est atteinte : la lecture est **partielle** et
      // doit être annoncée comme telle, jamais comme une réussite.
      truncated = true;
    }
    pages += windowPages;

    for (const order of collected) {
      const id = orderId(order);
      if (id) parId.set(id, order);
      else sansId.push(order);
    }
  }

  return { orders: [...parId.values(), ...sansId], pages, truncated };
}

/** Identifiant d'une commande (sert à ne pas compter deux fois la même). */
function orderId(order: unknown): string | null {
  if (!order || typeof order !== "object") return null;
  const id = (order as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}
