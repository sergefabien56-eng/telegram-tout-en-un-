/**
 * PRÉPARATION D'UNE COMMANDE — état affiché et rafraîchissement après action.
 *
 * Ce module fait le lien entre la donnée locale (articles enregistrés) et
 * l'API Jumia (transporteurs disponibles, confirmations de préparation).
 *
 * **Règle d'or.** L'application ne déclare jamais, seule, qu'une commande est
 * « prête à expédier » : elle ne le fait qu'après la **confirmation de
 * Jumia**. De même, « prêt à expédier » n'est **pas** « expédié » : le
 * statut local n'est jamais modifié à la suite d'une simple notification.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { normalizeOrder } from "@/lib/orders";
import { fetchOrdersPage } from "@/lib/jumia/orders";
import { syncOrderItems } from "@/lib/order-items-sync";
import { accountIdForShop } from "@/lib/jumia/accounts";
import {
  ITEM_STATUS_A_TRAITER,
  ITEM_STATUS_PRET,
  normalizeOrderStatus,
  orderFamily,
  orderStatusLabel,
  type OrderFamily,
} from "@/lib/order-status";
import {
  fetchShipmentProviders,
  type ShipmentProvider,
} from "@/lib/jumia/order-preparation";

/** Article présenté dans le panneau de préparation. */
export type PreparationArticle = {
  /** Identifiant de l'article **chez Jumia** (celui attendu par l'API). */
  id: string;
  name: string | null;
  sku: string | null;
  status: string;
  statusLabel: string;
  trackingNumber: string | null;
  countryCode: string | null;
  shipmentType: string | null;
  /** L'article attend encore une préparation. */
  needsPreparation: boolean;
  /** L'article est déjà prêt à partir (confirmé par Jumia). */
  readyToShip: boolean;
};

/** État complet du panneau de préparation. */
export type PreparationState = {
  family: OrderFamily;
  articles: PreparationArticle[];
  /** Articles qui attendent encore d'être préparés. */
  itemsToPrepare: string[];
  /** Articles déjà prêts à expédier côté Jumia. */
  itemsReady: string[];
  /** Transporteurs proposés par Jumia pour les articles à préparer. */
  providers: ShipmentProvider[];
  /** Transporteurs disponibles, article par article. */
  providersByItem: Record<string, string[]>;
  /** Transporteur proposé par défaut (premier disponible). */
  defaultProviderId: string | null;
  /** Message d'erreur de la lecture des transporteurs, le cas échéant. */
  providersError: string | null;
};

/**
 * Un article attend-il encore une préparation (emballage) ?
 *
 * Un article déjà « prêt à expédier » n'attend **plus** d'emballage : il est
 * exclu, sinon Jumia refuserait le lot (« article déjà emballé »).
 */
export function needsPreparation(status: string): boolean {
  const normalise = normalizeOrderStatus(status);
  return ITEM_STATUS_A_TRAITER.includes(normalise) && !ITEM_STATUS_PRET.includes(normalise);
}

/** Un article est-il déjà prêt à expédier (confirmé par Jumia) ? */
export function isReadyToShip(status: string): boolean {
  return ITEM_STATUS_PRET.includes(normalizeOrderStatus(status));
}

/**
 * Calcule l'état de préparation à partir des articles enregistrés.
 *
 * La famille de la commande est recalculée **avec** les statuts d'articles :
 * une commande « Multiple Status » ne peut pas être déclarée prête à
 * expédier sur la seule foi de son statut agrégé.
 */
export function buildPreparationState(params: {
  status: string;
  packedItems: number | null;
  totalItems: number | null;
  items: {
    externalItemId: string;
    status: string;
    productName: string | null;
    sellerSku: string | null;
    trackingNumber: string | null;
    countryCode: string | null;
    shipmentType: string | null;
  }[];
}): Omit<PreparationState, "providers" | "providersByItem" | "defaultProviderId" | "providersError"> {
  const articles: PreparationArticle[] = params.items.map((item) => ({
    id: item.externalItemId,
    name: item.productName,
    sku: item.sellerSku,
    status: item.status,
    statusLabel: orderStatusLabel(item.status),
    trackingNumber: item.trackingNumber,
    countryCode: item.countryCode,
    shipmentType: item.shipmentType,
    needsPreparation: needsPreparation(item.status),
    readyToShip: isReadyToShip(item.status),
  }));

  const family = orderFamily({
    status: params.status,
    packedItems: params.packedItems,
    totalItems: params.totalItems,
    itemStatuses: params.items.map((item) => item.status),
  });

  return {
    family,
    articles,
    itemsToPrepare: articles.filter((a) => a.needsPreparation).map((a) => a.id),
    itemsReady: articles.filter((a) => a.readyToShip).map((a) => a.id),
  };
}

/**
 * Lit les transporteurs proposés par Jumia pour les articles à préparer.
 *
 * Une erreur de lecture **n'empêche pas** l'affichage du panneau : elle est
 * simplement affichée, pour que le vendeur comprenne pourquoi le choix du
 * transporteur est indisponible.
 */
export async function readShipmentProviders(params: {
  shopId: string;
  itemIds: string[];
}): Promise<{
  providers: ShipmentProvider[];
  providersByItem: Record<string, string[]>;
  defaultProviderId: string | null;
  providersError: string | null;
}> {
  if (params.itemIds.length === 0) {
    return { providers: [], providersByItem: {}, defaultProviderId: null, providersError: null };
  }
  try {
    const result = await fetchShipmentProviders({
      shopId: params.shopId,
      orderItemIds: params.itemIds,
    });
    const providersByItem: Record<string, string[]> = {};
    for (const [itemId, providers] of result.byItem) {
      providersByItem[itemId] = providers.map((provider) => provider.id);
    }
    return {
      providers: result.all,
      providersByItem,
      defaultProviderId: result.all[0]?.id ?? null,
      providersError: null,
    };
  } catch (error) {
    return {
      providers: [],
      providersByItem: {},
      defaultProviderId: null,
      providersError:
        error instanceof Error
          ? error.message
          : "Transporteurs indisponibles pour le moment.",
    };
  }
}

/**
 * Relit une commande chez Jumia après une action de préparation.
 *
 * C'est la seule façon de connaître le **vrai** état de la commande : ni le
 * statut, ni le nombre d'articles emballés ne sont devinés. Jumia reste la
 * source de vérité ; l'application ne fait que recopier ce qu'elle renvoie.
 */
export async function refreshOrderFromJumia(params: {
  shopId: string;
  remoteShopId: string;
  orderId: string;
  externalOrderId: string;
  remoteCreatedAt: Date | null;
  accountId?: string | null;
}): Promise<{ refreshed: boolean; status: string | null; packedItems: number | null }> {
  const db = getDb();

  // Fenêtre de lecture : la commande est cherchée autour de sa date de
  // création, +/- 1 jour. Jumia refuse de filtrer par création et par mise
  // à jour dans le même appel.
  const centre = params.remoteCreatedAt ?? new Date();
  const debut = new Date(centre.getTime() - 24 * 60 * 60 * 1000);
  const fin = new Date(centre.getTime() + 24 * 60 * 60 * 1000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  let remote: Record<string, unknown> | null = null;
  try {
    const page = await fetchOrdersPage({
      shopId: params.remoteShopId,
      accountId: params.accountId ?? undefined,
      createdAfter: iso(debut),
      createdBefore: iso(fin),
      size: 100,
      sort: "ASC",
    });
    for (const raw of page.orders) {
      const record = raw as { id?: unknown };
      if (typeof record?.id === "string" && record.id === params.externalOrderId) {
        remote = raw as Record<string, unknown>;
        break;
      }
    }
  } catch {
    return { refreshed: false, status: null, packedItems: null };
  }

  if (!remote) return { refreshed: false, status: null, packedItems: null };

  const normalized = normalizeOrder(params.shopId, remote);
  if (!normalized) return { refreshed: false, status: null, packedItems: null };

  await db
    .update(schema.orders)
    .set({
      orderNumber: normalized.orderNumber,
      status: normalized.status,
      countryCode: normalized.countryCode,
      currency: normalized.currency,
      totalAmountMinor: normalized.totalAmountMinor,
      totalAmountUsdMinor: normalized.totalAmountUsdMinor,
      totalItems: normalized.totalItems,
      packedItems: normalized.packedItems,
      isPrepayment: normalized.isPrepayment,
      hasMultipleStatus: normalized.hasMultipleStatus,
      deliveryOption: normalized.deliveryOption,
      customerFirstName: normalized.customerFirstName,
      customerLastName: normalized.customerLastName,
      customerCity: normalized.customerCity,
      remoteCreatedAt: normalized.remoteCreatedAt,
      remoteUpdatedAt: normalized.remoteUpdatedAt,
      raw: normalized.raw,
      syncedAt: normalized.syncedAt,
    })
    .where(and(eq(schema.orders.id, params.orderId), eq(schema.orders.shopId, params.shopId)));

  // Les articles sont relus eux aussi : c'est au niveau de l'article que
  // Jumia porte le statut « prêt à expédier ».
  await syncOrderItems({
    shopId: params.shopId,
    remoteShopId: params.remoteShopId,
    orderIds: [params.orderId],
    accountId: params.accountId ?? undefined,
  });

  return {
    refreshed: true,
    status: normalized.status,
    packedItems: normalized.packedItems ?? null,
  };
}

/** Compte vendeur Jumia d'une boutique (null si la boutique n'en a pas). */
export async function shopAccountId(shopId: string): Promise<string | null> {
  return accountIdForShop(shopId);
}
