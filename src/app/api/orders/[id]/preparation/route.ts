import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { orderScope } from "@/lib/order-access";
import { getOrderForUser } from "@/lib/orders";
import { listOrderItems } from "@/lib/order-items";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/ids";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  buildPreparationState,
  readShipmentProviders,
  refreshOrderFromJumia,
  shopAccountId,
} from "@/lib/order-preparation";
import {
  markOrderItemsReadyToShip,
  packOrderItems,
  describeJumiaRefusal,
} from "@/lib/jumia/order-preparation";
import { reconcileOrderAlerts } from "@/lib/order-alerts";

export const dynamic = "force-dynamic";

/**
 * `/api/orders/[id]/preparation` — préparer les articles d'une commande et
 * demander son passage « Prêtes à expédier ».
 *
 * **Contrôle des droits, côté serveur.** Le bouton peut être visible ou
 * non, mais la décision qui compte est celle du serveur : un utilisateur
 * sans `orders:write` sur la boutique reçoit `403`, quoi qu'il tente.
 *
 * **Rien n'est locally décidé.** Un article n'est présenté comme « prêt à
 * expédier » qu'après la confirmation de Jumia ; un refus ou une réussite
 * partielle sont rapportés article par article.
 */

/** Charge la commande et ses articles, périmètre de l'utilisateur inclus. */
async function loadOrder(userId: string, orderId: string) {
  const scope = await orderScope(userId);
  const shopIds = scope.allowed.map((shop) => shop.id);
  if (shopIds.length === 0) return null;
  const order = await getOrderForUser(orderId, shopIds);
  if (!order) return null;
  const items = await listOrderItems(order.id);
  return { order, items, scope };
}

/** GET /api/orders/[id]/preparation — état du panneau de préparation. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "Commande introuvable.");

  const loaded = await loadOrder(user.id, id);
  if (!loaded) return fail(404, "Commande introuvable.");

  const { order, items } = loaded;
  const etat = buildPreparationState({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
    items: items.map((item) => ({
      externalItemId: item.externalItemId,
      status: item.status,
      productName: item.productName,
      sellerSku: item.sellerSku,
      trackingNumber: item.trackingNumber,
      countryCode: item.countryCode,
      shipmentType: item.shipmentType,
    })),
  });

  const write = await can(user.id, order.shopId, "orders:write");
  const providers = write
    ? await readShipmentProviders({ shopId: order.shopId, itemIds: etat.itemsToPrepare })
    : {
        providers: [],
        providersByItem: {},
        defaultProviderId: null,
        providersError: null,
      };

  return ok({
    orderId: order.id,
    shopId: order.shopId,
    shopName: order.shopName,
    orderNumber: order.orderNumber ?? order.externalOrderId,
    externalOrderId: order.externalOrderId,
    family: etat.family,
    articles: etat.articles,
    itemsToPrepare: etat.itemsToPrepare,
    itemsReady: etat.itemsReady,
    canWrite: write,
    providers: providers.providers,
    providersByItem: providers.providersByItem,
    defaultProviderId: providers.defaultProviderId,
    providersError: providers.providersError,
  });
}

/** Corps attendu par POST. */
type PreparationBody = {
  action?: unknown;
  itemIds?: unknown;
  shipmentProviderId?: unknown;
};

/** POST /api/orders/[id]/preparation — agit chez Jumia, puis relit l'état. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "Commande introuvable.");

  let body: PreparationBody;
  try {
    body = (await request.json()) as PreparationBody;
  } catch {
    return fail(400, "Requête illisible.");
  }

  const loaded = await loadOrder(user.id, id);
  if (!loaded) return fail(404, "Commande introuvable.");

  const { order, items } = loaded;

  // --- Contrôle des droits, côté serveur ---------------------------------
  const write = await can(user.id, order.shopId, "orders:write");
  if (!write) {
    return fail(
      403,
      "Votre rôle ne permet pas de préparer les commandes de cette boutique.",
    );
  }

  const action = body.action;
  if (action !== "pack" && action !== "ready_to_ship") {
    return fail(400, "Action inconnue.");
  }

  // --- Articles demandés : ils doivent appartenir à cette commande -------
  const idsCommande = new Set(items.map((item) => item.externalItemId));
  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const horsCommande = itemIds.filter((itemId) => !idsCommande.has(itemId));
  if (horsCommande.length > 0) {
    return fail(400, "Un des articles demandés n'appartient pas à cette commande.");
  }
  if (itemIds.length === 0) {
    return fail(400, "Sélectionnez au moins un article.");
  }

  const shopRow = await getDb()
    .select({ remoteShopId: schema.shops.remoteShopId })
    .from(schema.shops)
    .where(eq(schema.shops.id, order.shopId))
    .limit(1);
  const remoteShopId = shopRow[0]?.remoteShopId ?? null;
  if (!remoteShopId) {
    return fail(409, "Cette boutique n'est pas rattachée à une boutique Jumia.");
  }
  const accountId = await shopAccountId(order.shopId);

  let outcome;
  if (action === "pack") {
    const shipmentProviderId =
      typeof body.shipmentProviderId === "string" ? body.shipmentProviderId : "";
    if (!shipmentProviderId) {
      return fail(400, "Choisissez un transporteur avant de préparer les articles.");
    }

    // Le transporteur doit être celui que Jumia propose pour ces articles :
    // on ne transmet jamais un identifiant inventé.
    const providers = await readShipmentProviders({
      shopId: order.shopId,
      itemIds,
    });
    const autorises = new Set(providers.providers.map((provider) => provider.id));
    if (!autorises.has(shipmentProviderId)) {
      return fail(
        400,
        providers.providersError ??
          "Ce transporteur n'est pas proposé par Jumia pour ces articles.",
      );
    }

    outcome = await packOrderItems({
      shopId: order.shopId,
      items: itemIds.map((itemId) => ({ id: itemId, shipmentProviderId })),
    });
  } else {
    outcome = await markOrderItemsReadyToShip({
      shopId: order.shopId,
      orderItemIds: itemIds,
    });
  }

  // --- Relecture de l'état réel chez Jumia --------------------------------
  let refresh = { refreshed: false, status: null as string | null, packedItems: null as number | null };
  if (outcome.succeeded.length > 0) {
    refresh = await refreshOrderFromJumia({
      shopId: order.shopId,
      remoteShopId,
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      remoteCreatedAt: order.remoteCreatedAt,
      accountId,
    });
  }

  // L'alerte de commande est recalculée : une commande préparée n'a plus à
  // être signalée comme « en attente ».
  try {
    await reconcileOrderAlerts({ shopIds: [order.shopId] });
  } catch (error) {
    console.error("[preparation] réconciliation des alertes impossible", error);
  }

  const itemsAfter = await listOrderItems(order.id);
  const etat = buildPreparationState({
    status: refresh.status ?? order.status,
    packedItems: refresh.packedItems ?? order.packedItems,
    totalItems: order.totalItems,
    items: itemsAfter.map((item) => ({
      externalItemId: item.externalItemId,
      status: item.status,
      productName: item.productName,
      sellerSku: item.sellerSku,
      trackingNumber: item.trackingNumber,
      countryCode: item.countryCode,
      shipmentType: item.shipmentType,
    })),
  });

  const succesTotal = outcome.succeeded.length > 0 && outcome.failed.length === 0;
  const echecTotal = outcome.succeeded.length === 0 && outcome.failed.length > 0;

  return ok({
    action,
    succeeded: outcome.succeeded,
    failed: outcome.failed,
    httpStatus: outcome.httpStatus,
    error: outcome.error,
    refusal: echecTotal ? describeJumiaRefusal(outcome) : null,
    /** Succès complet, réussite partielle ou refus. */
    outcome: succesTotal ? "succes" : echecTotal ? "refus" : "partiel",
    refreshed: refresh.refreshed,
    family: etat.family,
    articles: etat.articles,
    itemsToPrepare: etat.itemsToPrepare,
    itemsReady: etat.itemsReady,
  });
}
