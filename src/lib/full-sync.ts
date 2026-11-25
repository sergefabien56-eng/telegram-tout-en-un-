import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { syncShopCatalog } from "@/lib/catalog-sync";
import { syncShopOrders } from "@/lib/orders-sync";
import { syncShopPayments } from "@/lib/payments-sync";

/**
 * Synchronisation complète d'une boutique rattachée : catalogue + stocks,
 * commandes puis relevés de versement.
 *
 * Pourquoi ce module existe : une boutique venant d'être rattachée doit
 * afficher ses vraies données sans action manuelle du vendeur. Les trois
 * étapes sont enchaînées (le verrou `shops.sync_in_progress` est commun :
 * elles ne peuvent pas tourner en parallèle) et chacune est tolérante à
 * l'échec — une étape en erreur n'annule pas les autres.
 */

export type FullSyncStep = {
  ok: boolean;
  /** Nombre d'éléments lus chez Jumia (produits, commandes ou relevés). */
  fetched?: number;
  /** Nombre d'éléments réellement enregistrés dans notre base. */
  inserted?: number;
  reason?: string;
};

export type FullSyncResult = {
  ok: boolean;
  catalog: FullSyncStep;
  orders: FullSyncStep;
  payments: FullSyncStep;
};

/** Trace l'étape dans la table `jobs` (historique réel des synchronisations). */
async function logStep(
  shopId: string,
  type: "catalog" | "orders",
  step: FullSyncStep,
): Promise<void> {
  try {
    await getDb()
      .insert(schema.jobs)
      .values({
        type,
        shopId,
        status: step.ok ? "done" : "failed",
        payload: {
          fetched: step.fetched ?? 0,
          inserted: step.inserted ?? 0,
          reason: step.reason ?? null,
        },
        lastError: step.ok ? null : (step.reason ?? "Erreur inconnue"),
      });
  } catch {
    // L'historique ne doit jamais faire échouer une synchronisation.
  }
}

/**
 * Enchaîne catalogue + stocks, commandes et relevés pour une boutique.
 *
 * @param days Fenêtre des commandes (90 jours maximum chez Jumia).
 */
export async function syncShopFully(params: {
  userId: string;
  shopId: string;
  days?: number;
}): Promise<FullSyncResult> {
  const result: FullSyncResult = {
    ok: false,
    catalog: { ok: false },
    orders: { ok: false },
    payments: { ok: false },
  };

  // 1. Catalogue + stocks
  try {
    const catalog = await syncShopCatalog({
      userId: params.userId,
      shopId: params.shopId,
      kind: "all",
    });
    result.catalog = catalog.ok
      ? {
          ok: true,
          fetched: catalog.products,
          inserted: (catalog.productInserted ?? 0) + (catalog.stockMatched ?? 0),
        }
      : { ok: false, reason: catalog.reason ?? "Synchronisation du catalogue impossible." };
  } catch (error) {
    result.catalog = {
      ok: false,
      reason: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
  await logStep(params.shopId, "catalog", result.catalog);

  // 2. Commandes
  try {
    const orders = await syncShopOrders({
      userId: params.userId,
      shopId: params.shopId,
      days: params.days ?? 90,
    });
    result.orders = orders.ok
      ? { ok: true, fetched: orders.orders, inserted: orders.inserted }
      : { ok: false, reason: orders.reason ?? "Synchronisation des commandes impossible." };
  } catch (error) {
    result.orders = {
      ok: false,
      reason: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
  await logStep(params.shopId, "orders", result.orders);

  // 3. Relevés de versement (la table `jobs` est alimentée par la synchro
  //    des paiements elle-même : on ne la duplique pas).
  try {
    const payments = await syncShopPayments({
      userId: params.userId,
      shopId: params.shopId,
    });
    result.payments = payments.ok
      ? { ok: true, fetched: payments.fetched, inserted: payments.inserted }
      : { ok: false, reason: "Synchronisation des relevés impossible." };
  } catch (error) {
    result.payments = {
      ok: false,
      reason: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }

  result.ok = result.catalog.ok && result.orders.ok && result.payments.ok;

  await audit({
    userId: params.userId,
    entityType: "shop",
    entityId: params.shopId,
    action: "shop.full_synced",
    result: result.ok ? "success" : "failure",
    metadata: {
      catalog: result.catalog,
      orders: result.orders,
      payments: result.payments,
    },
  });

  return result;
}

/**
 * Synchronisation complète lancée en arrière-plan (après un rattachement).
 * Les erreurs sont journalisées, jamais remontées à l'appelant.
 */
export async function syncShopFullyInBackground(params: {
  userId: string;
  shopId: string;
  days?: number;
}): Promise<void> {
  try {
    await syncShopFully(params);
  } catch (error) {
    console.error("[sync] synchronisation complète impossible", error);
  }
}
