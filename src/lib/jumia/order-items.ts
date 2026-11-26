import { jumiaGet, jumiaPost } from "./request";

/**
 * Articles de commande (`GET /orders/items`) et étiquettes d'expédition
 * (`POST /orders/print-labels`).
 *
 * Deux notions distinctes, à ne jamais confondre :
 * - l'**article** est la ligne de commande (un produit vendu) : il porte son
 *   propre statut, son propre numéro de suivi ;
 * - l'**étiquette** est le document PDF printed pour un **colis** : Jumia
 *   regroupe lui-même les articles en colis et renvoie un PDF par colis.
 *
 * Une étiquette n'est pas une facture : ce sont deux documents différents,
 * fournis par deux endpoints différents.
 */

/** Statuts d'article reconnus par l'API Jumia. */
export const JUMIA_ITEM_STATUSES = [
  "PENDING",
  "SHIPPED",
  "CANCELED",
  "RETURNED",
  "FAILED",
  "DELIVERED",
  "READY_TO_SHIP",
] as const;

/** Statut d'article normalisé. */
export type JumiaItemStatus = (typeof JUMIA_ITEM_STATUSES)[number];

/** Article de commande, tel que Jumia le décrit. */
export type JumiaOrderItem = {
  id: string;
  shopId: string | null;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipmentType: string | null;
  deliveryOption: string | null;
  isFulfilledByJumia: boolean;
  itemPriceLocal: number | null;
  paidPriceLocal: number | null;
  shippingAmountLocal: number | null;
  countryCode: string | null;
  currency: string | null;
  productName: string | null;
  sellerSku: string | null;
  productImageUrl: string | null;
  shippedDate: string | null;
};

/** Articles d'une commande. */
export type JumiaOrderItemsBundle = {
  orderId: string;
  orderNumber: string | null;
  items: JumiaOrderItem[];
};

/** Nombre maximum d'identifiants d'articles par appel `print-labels`. */
export const PRINT_LABELS_MAX_ITEMS = 200;

/** Nombre de commandes par appel `GET /orders/items` (paramètres répétés). */
export const ORDER_ITEMS_BATCH = 40;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Normalise un article Jumia.
 *
 * Renvoie `null` si l'identifiant ou le statut manque : un article sans
 * identifiant n'est pas un article, et un article sans statut ne peut pas
 * être classé.
 */
export function normalizeJumiaOrderItem(raw: unknown): JumiaOrderItem | null {
  const item = raw as {
    id?: unknown;
    shopId?: unknown;
    status?: unknown;
    trackingNumber?: unknown;
    trackingUrl?: unknown;
    shipmentType?: unknown;
    deliveryOption?: unknown;
    isFulfilledByJumia?: unknown;
    itemPriceLocal?: unknown;
    paidPriceLocal?: unknown;
    shippingAmountLocal?: unknown;
    country?: { code?: unknown; currencyCode?: unknown };
    product?: { name?: unknown; sellerSku?: unknown; imageUrl?: unknown };
    shippedDate?: unknown;
  };

  const id = asString(item.id);
  const status = asString(item.status);
  if (!id || !status) return null;

  return {
    id,
    shopId: asString(item.shopId),
    status,
    trackingNumber: asString(item.trackingNumber),
    trackingUrl: asString(item.trackingUrl),
    shipmentType: asString(item.shipmentType),
    deliveryOption: asString(item.deliveryOption),
    isFulfilledByJumia: asBoolean(item.isFulfilledByJumia),
    itemPriceLocal: asNumber(item.itemPriceLocal),
    paidPriceLocal: asNumber(item.paidPriceLocal),
    shippingAmountLocal: asNumber(item.shippingAmountLocal),
    countryCode: asString(item.country?.code),
    currency: asString(item.country?.currencyCode),
    productName: asString(item.product?.name),
    sellerSku: asString(item.product?.sellerSku),
    productImageUrl: asString(item.product?.imageUrl),
    shippedDate: asString(item.shippedDate),
  };
}

/**
 * `GET /orders/items` — articles de plusieurs commandes.
 *
 * @param remoteShopId identifiant de boutique **distant** (filtre Jumia).
 * @param shopId      identifiant de boutique **local** (porteur du jeton).
 *
 * Le filtre `shopId` de la requête porte sur la boutique **distante** ;
 * l'authentification, elle, passe par la boutique locale : ce sont deux
 * identifiants différents, et les confondre romprait l'isolation.
 */
export async function fetchOrderItems(params: {
  remoteShopId: string;
  shopId: string;
  orderIds: string[];
}): Promise<JumiaOrderItemsBundle[]> {
  const orderIds = params.orderIds.filter((id) => id.length > 0);
  if (orderIds.length === 0) return [];

  const response = await jumiaGet(
    "/orders/items",
    { orderId: orderIds, shopId: params.remoteShopId },
    { shopId: params.shopId },
  );

  if (!response.ok) {
    const detail = await readJumiaMessage(response);
    throw new Error(
      `Jumia a refusé la lecture des articles (HTTP ${response.status})${detail ? ` : ${detail}` : "."}`,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    orderId?: unknown;
    orderNumber?: unknown;
    items?: unknown[];
  } | null;

  // Jumia renvoie un objet par commande demandée.
  const rawBundles: unknown[] = Array.isArray(body?.items)
    ? [body]
    : Array.isArray(body)
      ? (body as unknown[])
      : [];

  const bundles: JumiaOrderItemsBundle[] = [];
  for (const raw of rawBundles) {
    const record = raw as { orderId?: unknown; orderNumber?: unknown; items?: unknown };
    const orderId = asString(record.orderId) ?? orderIds[0] ?? null;
    if (!orderId) continue;
    const items = (Array.isArray(record.items) ? record.items : [])
      .map(normalizeJumiaOrderItem)
      .filter((item): item is JumiaOrderItem => item !== null);
    bundles.push({
      orderId,
      orderNumber: asString(record.orderNumber),
      items,
    });
  }

  return bundles;
}

/**
 * `POST /orders/print-labels` — impression des étiquettes d'un lot d'articles.
 *
 * Réponse **201** : `success.labels[]` décrit les colis (articles couverts,
 * pays, numéro de suivi, PDF en base64) et `error.orderItems[]` les articles
 * refusés. Une réponse peut être **partielle** : les deux branches sont
 * conservées séparément, jamais fusionnées.
 */
export type PrintLabelsOutcome = {
  /** Colis pour lesquels un PDF a été renvoyé. */
  labels: {
    orderItemIds: string[];
    countryCode: string | null;
    trackingNumber: string | null;
    /** PDF en base64, tel que renvoyé par Jumia. */
    label: string;
  }[];
  /** Nombre d'articles inclus dans les colis (champ `success.total`). */
  successTotal: number;
  /** Articles refusés par Jumia, avec le motif exact. */
  errors: { id: string; code: string | null; message: string | null }[];
  /** Nombre d'articles refusés (champ `error.total`). */
  errorTotal: number;
};

export async function printLabels(params: {
  /** Boutique **locale** : elle porte le compte Jumia de la boutique. */
  shopId: string;
  orderItemIds: string[];
}): Promise<PrintLabelsOutcome> {
  const orderItemIds = params.orderItemIds.filter((id) => id.length > 0);
  if (orderItemIds.length === 0) {
    return { labels: [], successTotal: 0, errors: [], errorTotal: 0 };
  }
  if (orderItemIds.length > PRINT_LABELS_MAX_ITEMS) {
    throw new Error(
      `Trop d'articles pour un seul appel print-labels (${orderItemIds.length} > ${PRINT_LABELS_MAX_ITEMS}).`,
    );
  }

  const response = await jumiaPost(
    "/orders/print-labels",
    { orderItemIds },
    { shopId: params.shopId },
  );

  if (!response.ok) {
    const detail = await readJumiaMessage(response);
    throw new Error(
      `Jumia a refusé l'impression des étiquettes (HTTP ${response.status})${detail ? ` : ${detail}` : "."}`,
    );
  }

  const body = await response.json().catch(() => null);
  return parsePrintLabelsResponse(body);
}

/**
 * Analyse la réponse `POST /orders/print-labels` — fonction **pure**.
 *
 * Les deux branches sont conservées séparément : `success.labels[]` décrit
 * les colis produits, `error.orderItems[]` les articles refusés. Une réponse
 * partielle reste donc distinguable d'une réussite complète.
 */
export function parsePrintLabelsResponse(body: unknown): PrintLabelsOutcome {
  const payload = body as {
    success?: { labels?: unknown[]; total?: unknown };
    error?: { orderItems?: unknown[]; total?: unknown };
  } | null;

  const labels: PrintLabelsOutcome["labels"] = [];
  for (const raw of Array.isArray(payload?.success?.labels) ? payload.success.labels : []) {
    const record = raw as {
      orderItemIds?: unknown;
      countryCode?: unknown;
      trackingNumber?: unknown;
      label?: unknown;
    };
    const items = Array.isArray(record.orderItemIds)
      ? record.orderItemIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    const pdf = asString(record.label);
    // Un colis sans identifiant d'article ni PDF n'est pas exploitable :
    // on ne l'invente pas, on l'ignore.
    if (items.length === 0 || !pdf) continue;
    labels.push({
      orderItemIds: items,
      countryCode: asString(record.countryCode),
      trackingNumber: asString(record.trackingNumber),
      label: pdf,
    });
  }

  const errors: PrintLabelsOutcome["errors"] = [];
  for (const raw of Array.isArray(payload?.error?.orderItems) ? payload.error.orderItems : []) {
    const record = raw as { id?: unknown; response?: { code?: unknown; message?: unknown } };
    const id = asString(record.id);
    if (!id) continue;
    errors.push({
      id,
      code: asString(record.response?.code),
      message: asString(record.response?.message),
    });
  }

  const successTotal = asNumber(payload?.success?.total);
  const errorTotal = asNumber(payload?.error?.total);

  return {
    labels,
    successTotal: successTotal ?? labels.reduce((total, l) => total + l.orderItemIds.length, 0),
    errors,
    errorTotal: errorTotal ?? errors.length,
  };
}

/** Message d'erreur renvoyé par Jumia (lisible, jamais de secret). */
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
