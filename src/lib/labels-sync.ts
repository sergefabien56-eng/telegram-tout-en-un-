import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { printLabels, PRINT_LABELS_MAX_ITEMS } from "@/lib/jumia/order-items";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { syncOrderItems } from "@/lib/order-items-sync";
import { labelItemConditions } from "@/lib/order-items";
import {
  decodeLabelPdf,
  upsertAvailableLabel,
  upsertErrorLabel,
  upsertPendingLabel,
} from "@/lib/shipment-labels";

export type LabelsSyncResult = {
  ok: boolean;
  reason?: string;
  /** Commandes considérées. */
  orders?: number;
  /** Articles éligibles à l'impression. */
  items?: number;
  /** Colis produits (PDF reçus). */
  packages?: number;
  /** Articles refusés par Jumia. */
  errors?: number;
  /** Articles dont le PDF n'a pas pu être obtenu. */
  pending?: number;
  /** Articles lus depuis Jumia pendant l'opération. */
  refreshed?: number;
};

/**
 * Demande les étiquettes d'expédition (`POST /orders/print-labels`).
 *
 * Trois règles guident l'opération :
 *
 * 1. **Éligibilité** : seuls les articles **livrables** (`PENDING` ou
 *    `READY_TO_SHIP`) dont l'étiquette n'a pas encore été obtenue peuvent
 *    être imprimés. Jumia refuse un article annulé, expédié ou livré ;
 *    l'API le signale explicitement par article refusé.
 * 2. **Idempotence** : la clé d'un colis dérive de la boutique, de la
 *    commande et des articles couverts. Relancer l'opération met à jour la
 *    même ligne au lieu d'en créer une seconde.
 * 3. **Honnêteté** : un étiquette n'est enregistrée comme *disponible* qu'
 *    après décodage base64, vérification de la signature `%PDF-` et calcul
 *    de son empreinte SHA-256. Tout le reste est *en attente* ou *erreur*.
 */
export async function syncShopLabels(params: {
  userId: string;
  shopId: string;
  /** Commandes ciblées ; par défaut, toutes celles qui ont un article éligible. */
  orderIds?: string[];
  /**
   * Période de création des commandes concernées. Sans ces bornes, toutes
   * les commandes éligibles de la boutique sont visées — comme le filtre
   * « toutes les boutiques » de l'interface.
   */
  from?: Date;
  to?: Date;
  requestMeta?: { ip?: string; userAgent?: string | null };
}): Promise<LabelsSyncResult> {
  const db = getDb();

  const shops = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = shops[0];
  if (!shop) return { ok: false, reason: "Boutique introuvable." };
  if (!shop.remoteShopId) {
    return {
      ok: false,
      reason: "Cette boutique n'est pas encore rattachée à une boutique Jumia.",
    };
  }

  const accountId = await accountIdForShop(params.shopId);
  if (!accountId) {
    return {
      ok: false,
      reason:
        "Cette boutique n'est liée à aucun compte vendeur Jumia : rattachez-la à un compte avant d'imprimer des étiquettes.",
    };
  }

  // Verrou de boutique : une seule opération d'expédition à la fois.
  const locked = await db
    .update(schema.shops)
    .set({ syncInProgress: true })
    .where(and(eq(schema.shops.id, params.shopId), eq(schema.shops.syncInProgress, false)))
    .returning({ id: schema.shops.id });
  if (locked.length === 0) {
    return {
      ok: false,
      reason: "Une synchronisation est déjà en cours pour cette boutique.",
    };
  }

  try {
    // 1. Commandes candidates : celles qui portent au moins un article prêt
    //    à expédier et sans numéro de suivi.
    const candidates = await listCandidateOrders(
      params.shopId,
      params.orderIds && params.orderIds.length > 0 ? params.orderIds : undefined,
      { from: params.from, to: params.to },
    );

    if (candidates.length === 0) {
      await db
        .update(schema.shops)
        .set({ syncInProgress: false, updatedAt: new Date() })
        .where(eq(schema.shops.id, params.shopId));
      return {
        ok: true,
        orders: 0,
        items: 0,
        packages: 0,
        errors: 0,
        pending: 0,
        refreshed: 0,
      };
    }

    // 2. Les articles sont relus depuis Jumia : l'éligibilité doit reposer
    //    sur l'état **actuel**, pas sur une lecture ancienne.
    const refreshed = await syncOrderItems({
      shopId: params.shopId,
      remoteShopId: shop.remoteShopId,
      orderIds: candidates,
      accountId,
    });

    // 3. Éligibilité recalculée sur les données qui viennent d'être enregistrées.
    const eligible = await listEligibleItems(params.shopId, candidates);
    const parCommande = new Map<string, string[]>();
    for (const item of eligible) {
      const list = parCommande.get(item.orderId) ?? [];
      list.push(item.externalItemId);
      parCommande.set(item.orderId, list);
    }

    let packages = 0;
    let errors = 0;
    let pending = 0;

    for (const [orderId, itemIds] of parCommande) {
      // Jumia limite l'appel à 200 articles : on découpe si nécessaire.
      for (let index = 0; index < itemIds.length; index += PRINT_LABELS_MAX_ITEMS) {
        const lot = itemIds.slice(index, index + PRINT_LABELS_MAX_ITEMS);
        try {
          const outcome = await printLabels({ shopId: params.shopId, orderItemIds: lot });

          for (const label of outcome.labels) {
            const decoded = decodeLabelPdf(label.label);
            if (!decoded) {
              // Document non conforme : on ne le présente pas comme
              // disponible, on le signale comme en attente d'un document
              // exploitable.
              pending += label.orderItemIds.length;
              await upsertPendingLabel({
                shopId: params.shopId,
                orderId,
                orderItemIds: label.orderItemIds,
                errorMessage:
                  "Jumia a renvoyé un document qui n'est pas un PDF exploitable : étiquette non enregistrée.",
              });
              continue;
            }

            packages += 1;
            await upsertAvailableLabel({
              shopId: params.shopId,
              orderId,
              orderItemIds: label.orderItemIds,
              countryCode: label.countryCode,
              trackingNumber: label.trackingNumber,
              pdf: decoded.pdf,
              pdfSha256: decoded.sha256,
              pdfSize: decoded.size,
            });
            // Le numéro de suivi du colis est reporté sur les articles :
            // ils ne seront plus proposés à l'impression.
            if (label.trackingNumber) {
              await attachTrackingNumber(
                params.shopId,
                orderId,
                label.orderItemIds,
                label.trackingNumber,
              );
            }
          }

          for (const failure of outcome.errors) {
            errors += 1;
            await upsertErrorLabel({
              shopId: params.shopId,
              orderId,
              orderItemId: failure.id,
              errorCode: failure.code,
              errorMessage: failure.message,
            });
          }

          // Les articles du lot qui n'ont été ni produits ni refusés
          // restent sans étiquette : ils sont comptés comme « pas encore
          // disponibles », jamais comme des succès.
          const traites = new Set<string>([
            ...outcome.labels.flatMap((label) => label.orderItemIds),
            ...outcome.errors.map((failure) => failure.id),
          ]);
          const manquants = lot.filter((id) => !traites.has(id));
          if (manquants.length > 0) {
            pending += manquants.length;
            await upsertPendingLabel({
              shopId: params.shopId,
              orderId,
              orderItemIds: manquants,
              errorMessage:
                "Jumia n'a renvoyé aucune étiquette pour ces articles : document pas encore disponible.",
            });
          }
        } catch (error) {
          // L'appel a échoué : les articles du lot restent « pas encore
          // disponibles », avec le motif exact de l'échec.
          pending += lot.length;
          const message = error instanceof Error ? error.message : "Erreur inconnue";
          await upsertPendingLabel({
            shopId: params.shopId,
            orderId,
            orderItemIds: lot,
            errorMessage: message.slice(0, 300),
          });
        }
      }
    }

    await db
      .update(schema.shops)
      .set({ syncInProgress: false, updatedAt: new Date() })
      .where(eq(schema.shops.id, params.shopId));

    await audit({
      action: "shop.labels_generated",
      result: "success",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: {
        orders: candidates.length,
        items: eligible.length,
        packages,
        errors,
        pending,
        refreshed: refreshed.fetched,
        skipped: refreshed.skipped,
      },
    });

    return {
      ok: true,
      orders: candidates.length,
      items: eligible.length,
      packages,
      errors,
      pending,
      refreshed: refreshed.fetched,
    };
  } catch (error) {
    await db
      .update(schema.shops)
      .set({ syncInProgress: false, updatedAt: new Date() })
      .where(eq(schema.shops.id, params.shopId));

    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await audit({
      action: "shop.labels_generated",
      result: "failure",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: { error: message.slice(0, 300) },
    });
    return { ok: false, reason: message };
  }
}

/**
 * Commandes portant au moins un article **éligible à l'impression**.
 */
async function listCandidateOrders(
  shopId: string,
  orderIds?: string[],
  period: { from?: Date | undefined; to?: Date | undefined } = {},
): Promise<string[]> {
  const db = getDb();
  const conditions = [eq(schema.orders.shopId, shopId), ...labelItemConditions([shopId])];
  if (orderIds && orderIds.length > 0) {
    conditions.push(inArray(schema.orders.id, orderIds));
  }
  if (period.from) conditions.push(gte(schema.orders.remoteCreatedAt, period.from));
  if (period.to) conditions.push(lte(schema.orders.remoteCreatedAt, period.to));
  const rows = await db
    .selectDistinct({ id: schema.orders.id })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(...conditions));
  return rows.map((row) => row.id);
}

/** Articles éligibles à l'impression, après relecture. */
async function listEligibleItems(
  shopId: string,
  orderIds: string[],
): Promise<{ orderId: string; externalItemId: string }[]> {
  if (orderIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      orderId: schema.orderItems.orderId,
      externalItemId: schema.orderItems.externalItemId,
    })
    .from(schema.orderItems)
    .where(
      and(
        ...labelItemConditions([shopId]),
        inArray(schema.orderItems.orderId, orderIds),
      ),
    );
  return rows;
}

/** Reporte le numéro de suivi du colis sur les articles qu'il couvre. */
async function attachTrackingNumber(
  shopId: string,
  orderId: string,
  orderItemIds: string[],
  trackingNumber: string,
): Promise<void> {
  if (orderItemIds.length === 0) return;
  const db = getDb();
  await db
    .update(schema.orderItems)
    .set({ trackingNumber })
    .where(
      and(
        eq(schema.orderItems.shopId, shopId),
        eq(schema.orderItems.orderId, orderId),
        inArray(schema.orderItems.externalItemId, orderItemIds),
      ),
    );
}
