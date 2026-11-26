import { and, eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getDb, schema } from "@/db";
import { fetchAllOrderPages } from "@/lib/jumia/orders";
import { normalizeOrder, upsertOrders } from "@/lib/orders";
import { syncOrderItems } from "@/lib/order-items-sync";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { belongsToShop, orderShopIds } from "@/lib/shop-guard";
import { MAX_SYNC_WINDOW_DAYS, ORDERS_MAX_PAGES, ORDERS_PAGE_SIZE } from "@/lib/order-sync-policy";

export type SyncResult = {
  ok: boolean;
  reason?: string;
  orders?: number;
  inserted?: number;
  updated?: number;
  pages?: number;
  truncated?: boolean;
  /** Commandes lues mais écartées : elles appartenaient à une autre boutique. */
  skipped?: number;
  /**
   * Période réellement relue (bornes en UTC). Les commandes plus anciennes
   * dont le statut a changé sont également relues : voir `followedUpdates`.
   */
  window?: { from: string; to: string };
  /** Des commandes antérieures à la fenêtre ont été relues (changement de statut). */
  followedUpdates?: boolean;
  /**
   * La synchronisation a été **partielle** (limite de pages atteinte) : elle
   * ne doit jamais être présentée comme réussie.
   */
  partial?: boolean;
  /** Articles de commande lus depuis Jumia. */
  items?: number;
  /** Articles insérés ou mis à jour en base. */
  itemsSaved?: number;
  /** Articles écartés : ils portaient l'identifiant d'une autre boutique. */
  itemsSkipped?: number;
  /** Commandes dont les articles n'ont pas pu être lus. */
  itemsFailed?: number;
};

/** Formate une date en `YYYY-MM-DD` (UTC), format attendu par Jumia. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MAX_DAYS = MAX_SYNC_WINDOW_DAYS; // la plage Jumia est limitée à 3 mois

/** Plage maximale lisible par l'API Jumia (documentée dans le projet). */
export const MAX_SYNC_DAYS = MAX_SYNC_WINDOW_DAYS;
const DEFAULT_DAYS = 30;
const MAX_PAGES = ORDERS_MAX_PAGES;

/**
 * Synchronise les commandes d'une boutique rattachée sur les `days` derniers jours.
 *
 * Verrou par boutique (`shops.sync_in_progress`) : impossible de lancer deux
 * synchronisations simultanées sur la même boutique.
 */
export async function syncShopOrders(params: {
  userId: string;
  shopId: string;
  /** Fenêtre glissante en jours (usage historique). */
  days?: number;
  /** Bornes explicites de la période demandée (usage « synchroniser cette période »). */
  from?: Date;
  to?: Date;
  /**
   * Relire aussi les commandes **plus anciennes** dont le statut a changé
   * (`updatedAfter` de l'API Jumia). Sans cela, une synchronisation limitée
   * aux nouvelles dates de création manquerait les changements de statut
   * ultérieurs.
   */
  followUpdates?: boolean;
  requestMeta?: { ip?: string; userAgent?: string | null };
}): Promise<SyncResult> {
  const db = getDb();
  const days = Math.min(Math.max(Math.round(params.days ?? DEFAULT_DAYS), 1), MAX_DAYS);

  // Bornes de la période : dates explicites si fournies, sinon fenêtre
  // glissante de `days` jours. La plage Jumia est limitée à 90 jours.
  const fin = params.to ? new Date(params.to) : new Date();
  const debut = params.from
    ? new Date(params.from)
    : new Date(fin.getTime() - days * 24 * 60 * 60 * 1000);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
    return { ok: false, reason: "Période invalide." };
  }
  if (debut > fin) {
    return {
      ok: false,
      reason: "Période invalide : la date de début est postérieure à la date de fin.",
    };
  }
  const spanDays = Math.ceil((fin.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000));
  if (spanDays > MAX_DAYS) {
    return {
      ok: false,
      reason: `Période trop large : l'API Jumia ne permet de relire que ${MAX_DAYS} jours à la fois.`,
    };
  }

  let lockReleased = false;
  async function releaseLock() {
    if (lockReleased) return;
    lockReleased = true;
    await db
      .update(schema.shops)
      .set({ syncInProgress: false })
      .where(eq(schema.shops.id, params.shopId));
  }

  const shops = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = shops[0];
  if (!shop) return { ok: false, reason: "Boutique introuvable." };

  const remoteShopId = shop.remoteShopId;
  if (!remoteShopId) {
    return {
      ok: false,
      reason: "Cette boutique n'est pas encore rattachée à une boutique Jumia.",
    };
  }

  // Verrou : une seule synchronisation par boutique. La condition dans le WHERE
  // rend l'opération atomique — pas de course entre deux lancements simultanés.
  const locked = await db
    .update(schema.shops)
    .set({ syncInProgress: true })
    .where(and(eq(schema.shops.id, params.shopId), eq(schema.shops.syncInProgress, false)))
    .returning({ id: schema.shops.id });
  if (locked.length === 0) {
    return { ok: false, reason: "Une synchronisation est déjà en cours pour cette boutique." };
  }

  // Compte vendeur Jumia de la boutique : il doit être lié explicitement.
  // Aucune lecture du compte d'une autre boutique n'est possible.
  const accountId = await accountIdForShop(params.shopId);
  if (!accountId) {
    await releaseLock();
    return {
      ok: false,
      reason:
        "Cette boutique n'est liée à aucun compte vendeur Jumia : rattachez-la à un compte avant de synchroniser.",
    };
  }

  // Fenêtre de mise à jour : on relit aussi les commandes plus anciennes
  // dont le statut a changé depuis la dernière synchronisation réussie.
  const followUpdates = params.followUpdates === true;
  const dernierSync = shop.lastSyncAt ? new Date(shop.lastSyncAt) : null;
  const updateAfter = followUpdates
    ? isoDate(dernierSync ?? new Date(fin.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000))
    : undefined;

  try {
    const { orders, pages, truncated } = await fetchAllOrderPages({
      shopId: remoteShopId,
      accountId: accountId ?? undefined,
      createdAfter: isoDate(debut),
      createdBefore: isoDate(fin),
      ...(updateAfter ? { updatedAfter: updateAfter, updatedBefore: isoDate(fin) } : {}),
      size: ORDERS_PAGE_SIZE,
      sort: "DESC",
      maxPages: MAX_PAGES,
    });

    // Garde-fou : une commande portant l'identifiant d'une autre boutique
    // n'est jamais enregistrée sous celle-ci (Jumia peut renvoyer les
    // commandes d'un compte multi-boutiques).
    const foreign = orders.filter(
      (raw) => !belongsToShop(orderShopIds(raw as Record<string, unknown>), remoteShopId),
    );
    if (foreign.length > 0) {
      await audit({
        action: "shop.orders_synced",
        result: "blocked",
        userId: params.userId,
        entityType: "shop",
        entityId: params.shopId,
        ip: params.requestMeta?.ip,
        userAgent: params.requestMeta?.userAgent,
        metadata: { reason: "autre_boutique", ecartees: foreign.length },
      });
    }
    const kept = orders.filter((raw) =>
      belongsToShop(orderShopIds(raw as Record<string, unknown>), remoteShopId),
    );
    const normalized = kept.flatMap((raw) => {
      const row = normalizeOrder(params.shopId, raw);
      return row ? [row] : [];
    });
    const { inserted, updated } = await upsertOrders(normalized);

    // Les **articles** de ces commandes sont relus à leur tour : c'est à ce
    // niveau que Jumia porte le statut d'expédition et le numéro de suivi,
    // et c'est le niveau que l'impression des étiquettes utilise.
    // Un échec de cette lecture n'annule pas la synchronisation des
    // commandes : il est compté et signalé.
    const externalIds = normalized
      .map((row) => row.externalOrderId)
      .filter((value): value is string => Boolean(value));
    const localOrders = externalIds.length
      ? await db
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.shopId, params.shopId),
              inArray(schema.orders.externalOrderId, externalIds),
            ),
          )
      : [];
    const items = await syncOrderItems({
      shopId: params.shopId,
      remoteShopId,
      orderIds: localOrders.map((order) => order.id),
      accountId: accountId ?? undefined,
    });

    // Une synchronisation **partielle** (limite de pages atteinte) n'est pas
    // une réussite : la boutique est marquée « partial » pour que l'interface
    // ne présente jamais une lecture incomplète comme un succès.
    const partial = truncated;
    await db
      .update(schema.shops)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: partial ? "partial" : "ok",
        syncInProgress: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.shops.id, params.shopId));

    await audit({
      action: "shop.orders_synced",
      result: "success",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: {
        days,
        from: isoDate(debut),
        to: isoDate(fin),
        followedUpdates: followUpdates,
        fetched: orders.length,
        inserted,
        updated,
        pages,
        truncated,
        partial,
        items: items.fetched,
        itemsSaved: items.inserted + items.updated,
        itemsSkipped: items.skipped,
        itemsFailed: items.failed,
      },
    });

    await releaseLock();
    return {
      ok: true,
      orders: kept.length,
      inserted,
      updated,
      pages,
      truncated,
      skipped: foreign.length,
      partial,
      items: items.fetched,
      itemsSaved: items.inserted + items.updated,
      itemsSkipped: items.skipped,
      itemsFailed: items.failed,
      followedUpdates: followUpdates,
      window: { from: isoDate(debut), to: isoDate(fin) },
    };
  } catch (error) {
    await db
      .update(schema.shops)
      .set({ lastSyncStatus: "error", updatedAt: new Date() })
      .where(eq(schema.shops.id, params.shopId));
    await releaseLock();

    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await audit({
      action: "shop.orders_synced",
      result: "failure",
      userId: params.userId,
      entityType: "shop",
      entityId: params.shopId,
      ip: params.requestMeta?.ip,
      userAgent: params.requestMeta?.userAgent,
      metadata: {
        days,
        from: isoDate(debut),
        to: isoDate(fin),
        error: message.slice(0, 300),
      },
    });

    return { ok: false, reason: message };
  }
}
