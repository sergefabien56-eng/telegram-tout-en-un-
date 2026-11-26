import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { syncShopOrders } from "@/lib/orders-sync";

/**
 * Synchronisation automatique des commandes.
 *
 * **Pourquoi ce module existe.** L'API Vendor Center de Jumia n'expose aucun
 * webhook : la spec OpenAPI officielle ne mentionne `webhook` nulle part, et
 * le seul point de rappel (`/callback`) est la redirection OAuth. La seule
 * façon de voir une nouvelle commande sans action du vendeur est donc de
 * **relire** périodiquement l'API — un polling, comme le fait tout ERP.
 *
 * **Ce que fait la relecture.** Une fenêtre courte (`AUTO_SYNC_WINDOW_DAYS`)
 * suffit à capter les nouvelles commandes ; `followUpdates` ajoute la
 * relecture des commandes **plus anciennes** dont le statut a changé
 * (`updatedAfter`), sans quoi un colis qui passe « expédié » trois jours après
 * sa création resterait invisible.
 *
 * **Ce que la synchronisation automatique ne fait pas.** Elle n'imprime
 * aucune étiquette : l'impression engage le vendeur auprès du transporteur,
 * elle reste une action explicite.
 */

/** Fenêtre rejouée à chaque passage automatique (jours). */
export const AUTO_SYNC_WINDOW_DAYS = 7;

/**
 * Âge au-delà duquel les données sont jugées périmées et triggering une
 * relecture automatique. Court : l'objectif est que le vendeur voie une
 * nouvelle commande sans rien cliquer.
 */
export const AUTO_SYNC_MAX_AGE_MS = 90_000;

/** État de fraîcheur d'une boutique. */
export type AutoSyncState = {
  shopId: string;
  /** Dernière synchronisation réussie (ISO 8601) ou `null`. */
  lastSyncAt: string | null;
  /** Une synchronisation est-elle en cours ? */
  syncInProgress: boolean;
  /** Les données sont-elles périmées ? */
  stale: boolean;
};

/** Les données de la boutique sont-elles périmées ? */
export function isStale(lastSyncAt: Date | null, now: Date = new Date()): boolean {
  if (!lastSyncAt) return true;
  return now.getTime() - lastSyncAt.getTime() > AUTO_SYNC_MAX_AGE_MS;
}

/**
 * État de fraîcheur de plusieurs boutiques.
 *
 * Une boutique **non rattachée** à Jumia n'est jamais périmée : il n'y a
 * rien à relire, et la faire passer pour périmée déclencherait des appels
 * inutiles.
 */
export async function readAutoSyncStates(
  shopIds: string[],
  now: Date = new Date(),
): Promise<AutoSyncState[]> {
  const ids = shopIds.filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const rows = await getDb()
    .select({
      id: schema.shops.id,
      lastSyncAt: schema.shops.lastSyncAt,
      syncInProgress: schema.shops.syncInProgress,
      remoteShopId: schema.shops.remoteShopId,
    })
    .from(schema.shops)
    .where(inArray(schema.shops.id, ids));

  return rows.map((row) => {
    const rattachee = Boolean(row.remoteShopId);
    return {
      shopId: row.id,
      lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
      syncInProgress: Boolean(row.syncInProgress),
      stale: rattachee && isStale(row.lastSyncAt ? new Date(row.lastSyncAt) : null, now),
    };
  });
}

/** État de fraîcheur d'une boutique. */
export async function readAutoSyncState(
  shopId: string,
  now: Date = new Date(),
): Promise<AutoSyncState | null> {
  const states = await readAutoSyncStates([shopId], now);
  return states[0] ?? null;
}

/**
 * Lance une relecture automatique si les données sont périmées.
 *
 * Le lancement est **non bloquant** : l'appelant reçoit immédiatement
 * l'accusé de réception, la relecture se poursuit en arrière-plan. Le verrou
 * `shops.sync_in_progress` (posé par `syncShopOrders`) garantit qu'une seule
 * relecture tourne à la fois par boutique : deux onglets ouverts ne doublent
 * pas les appels à l'API Jumia.
 */
export async function startAutoSync(params: {
  userId: string;
  shopId: string;
  now?: Date;
}): Promise<{ started: boolean; state: AutoSyncState | null; reason?: string }> {
  const state = await readAutoSyncState(params.shopId, params.now ?? new Date());
  if (!state) return { started: false, state: null, reason: "Boutique introuvable." };
  if (state.syncInProgress) {
    return { started: false, state, reason: "Synchronisation déjà en cours." };
  }
  if (!state.stale) {
    return { started: false, state, reason: "Données à jour." };
  }

  // La relecture part en arrière-plan : l'interface ne doit pas attendre
  // l'API Jumia pour afficher la page.
  void (async () => {
    try {
      await syncShopOrders({
        userId: params.userId,
        shopId: params.shopId,
        days: AUTO_SYNC_WINDOW_DAYS,
        followUpdates: true,
      });
    } catch (error) {
      console.error("[auto-sync] relecture impossible", params.shopId, error);
    }
  })();

  return { started: true, state: { ...state, syncInProgress: true } };
}

/**
 * Relit **toutes** les boutiques rattachées à un compte vendeur.
 *
 * Utilisé par la tâche planifiée : le vendeur n'a pas besoin d'être connecté
 * pour que ses données soient à jour.
 */
export async function autoSyncAllShops(params: {
  ownerUserId: string;
  shopId: string;
  now?: Date;
}): Promise<{ started: boolean; reason?: string }> {
  const state = await readAutoSyncState(params.shopId, params.now ?? new Date());
  if (!state) return { started: false, reason: "Boutique introuvable." };
  if (state.syncInProgress) {
    return { started: false, reason: "Synchronisation déjà en cours." };
  }
  if (!state.stale) return { started: false, reason: "Données à jour." };

  void (async () => {
    try {
      await syncShopOrders({
        userId: params.ownerUserId,
        shopId: params.shopId,
        days: AUTO_SYNC_WINDOW_DAYS,
        followUpdates: true,
      });
    } catch (error) {
      console.error("[auto-sync] relecture planifiée impossible", params.shopId, error);
    }
  })();

  return { started: true };
}

/** Boutique rattachée à un compte vendeur et dont les données sont périmées ? */
export async function listStaleAttachedShops(
  now: Date = new Date(),
): Promise<{ id: string; ownerUserId: string; name: string }[]> {
  const rows = await getDb()
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      ownerUserId: schema.shops.ownerUserId,
      lastSyncAt: schema.shops.lastSyncAt,
      syncInProgress: schema.shops.syncInProgress,
      remoteShopId: schema.shops.remoteShopId,
      jumiaAccountId: schema.shops.jumiaAccountId,
    })
    .from(schema.shops)
    .where(
      and(
        eq(schema.shops.syncInProgress, false),
        // `isNotNull` sur une colonne text : le filtre est fait en JavaScript
        // pour rester lisible, le volume de boutiques étant faible.
      ),
    );

  return rows
    .filter(
      (row) =>
        Boolean(row.remoteShopId) &&
        Boolean(row.jumiaAccountId) &&
        isStale(row.lastSyncAt ? new Date(row.lastSyncAt) : null, now),
    )
    .map((row) => ({ id: row.id, name: row.name, ownerUserId: row.ownerUserId }));
}
