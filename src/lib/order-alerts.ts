/**
 * ALERTES DE COMMANDES JUMIA — module « Notifications — commandes Jumia ».
 *
 * **Ce que ce module produit.** Des alertes *in-application* : elles
 * s'affichent dans la cloche du web et dans la Mini App Telegram, quand
 * l'application est ouverte. **Aucun** message Telegram, e-mail ou push n'est
 * envoyé : la synchronisation continue en arrière-plan, mais elle ne
 * notifie personne en dehors de l'application.
 *
 * **Les trois alertes demandées.**
 * 1. `nouvelle_commande` — une commande vient d'arriver : boutique, heure de
 *    réception, accès au détail.
 * 2. `delai_24h` — la commande attend toujours sa préparation et le seuil
 *    préventif de 24 h est dépassé : l'alerte est *renforcée*.
 * 3. `synchronisation` — la relecture des commandes a échoué, est partielle
 *    ou est en retard : les données affichées peuvent être incomplètes.
 *
 * **Une seule alerte active par commande.** Le problème d'une commande est
 * unique : tant qu'elle attend une action, elle porte **une** alerte, dont
 * le contenu et la priorité évoluent (info → avertissement → critique). Il
 * n'y a donc jamais deux alertes concurrentes pour la même commande, ni
 * doublon à chaque passage de synchronisation : la clé de déduplication
 * (`boutique:commande`) est unique en base.
 *
 * **Le seuil de 24 h est préventif.** Il sert à ordonner le travail du
 * vendeur ; ce n'est **pas** une heure limite d'annulation : Jumia n'annule
 * pas automatiquement une commande à 24 h. Le texte des alertes le dit
 * explicitement, et le seuil est configurable par boutique.
 *
 * **Chaque alerte ouvre le bon détail et la bonne boutique**, et propose une
 * action adaptée à l'état *courant* de la commande : « Voir et préparer »
 * tant qu'elle attend sa préparation, une action différente une fois
 * qu'elle est prête (jamais une seconde préparation).
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { orderFamilyCondition } from "@/lib/orders";
import { listItemStatusesByOrder } from "@/lib/order-items";
import { orderFamily, type OrderFamily } from "@/lib/order-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Nature du problème porté par une alerte. */
export const ORDER_ALERT_KINDS = [
  "nouvelle_commande",
  "delai_24h",
  "synchronisation",
] as const;
export type OrderAlertKind = (typeof ORDER_ALERT_KINDS)[number];

/** Priorité de l'alerte : elle évolue avec la situation. */
export const ORDER_ALERT_PRIORITIES = ["info", "warning", "critical"] as const;
export type OrderAlertPriority = (typeof ORDER_ALERT_PRIORITIES)[number];

/** Statut de l'alerte : active ou résolue. */
export const ORDER_ALERT_STATUSES = ["active", "resolved"] as const;
export type OrderAlertStatus = (typeof ORDER_ALERT_STATUSES)[number];

/** Action proposée par une alerte, selon l'état courant de la commande. */
export type OrderAlertActionKind = "prepare" | "view" | "sync";
export type OrderAlertAction = {
  kind: OrderAlertActionKind;
  label: string;
  href: string;
};

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

/**
 * Seuil préventif par défaut, en heures.
 *
 * Mesure sur les commandes réellement observées (271 commandes expédiées) :
 * médiane 22,3 h, p75 37 h, p90 51 h, et 54 % expédiées en moins de 24 h.
 * 24 h est donc un repère de **priorisation** cohérent avec le rythme réel
 * — pas une règle Jumia.
 */
export const DEFAUT_DELAI_PREVENTIF_H = 24;

/**
 * Fraction du seuil à partir de laquelle l'alerte passe en « à traiter
 * rapidement » (avertissement) : la moitié du seuil, soit 12 h par défaut.
 */
export const FRACTION_URGENCE = 0.5;

/**
 * Au-delà de ce délai sans relecture réussie, les données sont jugées
 * « potentiellement incomplètes » (heures). La relecture planifiée passe
 * toutes les 3 h : 4 h laisse une marge avant de conclure à un retard.
 */
export const DEFAUT_SYNC_PERIME_H = 4;

/** Rang des priorités : sert à trier et à détecter une escalade. */
export const RANG_PRIORITE: Record<OrderAlertPriority, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

// ---------------------------------------------------------------------------
// Partie pure : calcul de l'alerte
// ---------------------------------------------------------------------------

/** Durée exprimée en heures, arrondie à la minute. */
export function heuresEntre(debut: Date | null, fin: Date): number | null {
  if (!debut) return null;
  return (fin.getTime() - debut.getTime()) / 3_600_000;
}

/** Durée lisible : « 3 h 20 », « 45 min », « 2 j 4 h ». */
export function formaterDuree(heures: number): string {
  if (!Number.isFinite(heures)) return "—";
  if (heures < 0) return "0 min";
  if (heures < 1) {
    const minutes = Math.max(1, Math.round(heures * 60));
    return `${minutes} min`;
  }
  if (heures < 48) {
    const h = Math.floor(heures);
    const min = Math.round((heures - h) * 60);
    return min > 0 ? `${h} h ${String(min).padStart(2, "0")}` : `${h} h`;
  }
  const jours = Math.floor(heures / 24);
  const h = Math.round(heures - jours * 24);
  return h > 0 ? `${jours} j ${h} h` : `${jours} j`;
}

/** Heure de réception au format court (jj/mm hh:mm). */
export function formaterHeure(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Résultat du calcul d'alerte pour une commande. */
export type OrderAlertComputation = {
  kind: OrderAlertKind;
  priority: OrderAlertPriority;
  title: string;
  body: string;
  /** Âge de la commande, en heures, mesuré sur l'horloge Jumia. */
  ageHours: number;
  /** Seuil préventif appliqué, en heures. */
  deadlineHours: number;
  /** Vrai quand l'alerte vient de franchir le seuil : c'est une escalade. */
  escalade: boolean;
};

/**
 * Calcule l'alerte d'une commande qui attend encore une action.
 *
 * L'horloge du seuil est celle de **Jumia** (`remoteCreatedAt`) : c'est elle
 * qui fait tourner le délai côté plateforme. L'heure de *réception* par
 * l'application (`firstSeenAt`) est conservée à part, dans le corps de
 * l'alerte, pour que le vendeur sache depuis quand la commande lui est
 * connue.
 *
 * Trois paliers :
 * - moins de la moitié du seuil → « nouvelle commande » (info) ;
 * - entre la moitié et le seuil → « à traiter rapidement » (avertissement) ;
 * - au-delà du seuil → « retard » (critique), c'est l'alerte renforcée.
 */
export function computeOrderAlert(params: {
  now: Date;
  shopName: string;
  orderNumber: string | null;
  externalOrderId: string;
  remoteCreatedAt: Date | null;
  firstSeenAt: Date | null;
  deadlineHours?: number;
}): OrderAlertComputation {
  const deadline = params.deadlineHours ?? DEFAUT_DELAI_PREVENTIF_H;
  const urgence = deadline * FRACTION_URGENCE;
  const reference = params.remoteCreatedAt ?? params.firstSeenAt;
  const ageHours = Math.max(0, heuresEntre(reference, params.now) ?? 0);
  const reception = params.firstSeenAt ?? params.remoteCreatedAt;

  const libelle = params.orderNumber ?? params.externalOrderId;
  const boutique = params.shopName;

  if (ageHours >= deadline) {
    return {
      kind: "delai_24h",
      priority: "critical",
      title: `Commande en retard — ${libelle}`,
    body:
      `Boutique ${boutique}. La commande ${libelle} attend toujours sa préparation depuis ` +
      `${formaterDuree(ageHours)} (créée chez Jumia le ${formaterHeure(params.remoteCreatedAt)}` +
        (reception && params.remoteCreatedAt && reception.getTime() !== params.remoteCreatedAt.getTime()
          ? `, reçue par l'application le ${formaterHeure(reception)}`
          : "") +
        `). Le seuil préventif de ${deadline} h est dépassé : traitez-la en priorité. ` +
        `Ce seuil sert à ordonner le travail, ce n'est pas une heure d'annulation automatique de Jumia.`,
      ageHours,
      deadlineHours: deadline,
      escalade: true,
    };
  }

  if (ageHours >= urgence) {
    return {
      kind: "nouvelle_commande",
      priority: "warning",
      title: `Commande à traiter rapidement — ${libelle}`,
      body:
        `Boutique ${boutique}. Commande ${libelle}, reçue le ${formaterHeure(reception)} : elle attend ` +
        `sa préparation depuis ${formaterDuree(ageHours)}. Le seuil préventif est de ${deadline} h ` +
        `(${formaterDuree(Math.max(0, deadline - ageHours))} restantes) : au-delà, l'alerte passe ` +
        `en retard. Ce seuil n'entraîne aucune annulation automatique.`,
      ageHours,
      deadlineHours: deadline,
      escalade: false,
    };
  }

  return {
    kind: "nouvelle_commande",
    priority: "info",
    title: `Nouvelle commande reçue — ${libelle}`,
    body:
      `Boutique ${boutique}. Commande ${libelle}, reçue le ${formaterHeure(reception)} : elle attend ` +
      `sa préparation depuis ${formaterDuree(ageHours)}. Le seuil préventif est de ${deadline} h : ` +
      `il permet de traiter les commandes les plus anciennes en premier. Ce seuil est un repère ` +
      `de priorisation, pas une annulation automatique.`,
    ageHours,
    deadlineHours: deadline,
    escalade: false,
  };
}

/** Calcul de l'alerte de synchronisation d'une boutique. */
export type SyncAlertComputation = {
  kind: OrderAlertKind;
  priority: OrderAlertPriority;
  title: string;
  body: string;
  escalade: boolean;
};

/**
 * Alerte « données potentiellement incomplètes ».
 *
 * Elle réutilise l'état de synchronisation existant (`shops.last_sync_status`
 * et `shops.last_sync_at`) : aucune relecture supplémentaire n'est nécessaire
 * pour savoir que les données peuvent être fausses.
 *
 * Une boutique **non rattachée** à Jumia n'est jamais signalée : il n'y a
 * rien à relire, et l'alerte serait un bruit.
 */
export function computeSyncAlert(params: {
  shopName: string;
  lastSyncStatus: string | null;
  lastSyncAt: Date | null;
  syncInProgress: boolean;
  now: Date;
  staleHours?: number;
  /** La boutique est-elle rattachée à une boutique Jumia ? */
  attached?: boolean;
}): SyncAlertComputation | null {
  const staleHours = params.staleHours ?? DEFAUT_SYNC_PERIME_H;
  const status = (params.lastSyncStatus ?? "").trim().toLowerCase();

  if (params.attached === false) return null;

  if (status === "error") {
    return {
      kind: "synchronisation",
      priority: "critical",
      title: `Données Jumia possiblement incomplètes — ${params.shopName}`,
      body:
        `La dernière relecture des commandes de ${params.shopName} a échoué` +
        (params.lastSyncAt ? ` (dernier succès le ${formaterHeure(params.lastSyncAt)})` : "") +
        `. Les commandes affichées peuvent être incomplètes ou en retard : ` +
        `relancez la synchronisation avant de conclure.`,
      escalade: true,
    };
  }

  if (status === "partial") {
    return {
      kind: "synchronisation",
      priority: "warning",
      title: `Synchronisation partielle — ${params.shopName}`,
      body:
        `La relecture des commandes de ${params.shopName} s'est interrompue` +
        (params.lastSyncAt ? ` (dernier passage le ${formaterHeure(params.lastSyncAt)})` : "") +
        `. Certaines commandes peuvent manquer : la donnée n'est pas complète.`,
      escalade: false,
    };
  }

  const age = heuresEntre(params.lastSyncAt, params.now);
  if (age !== null && age > staleHours) {
    return {
      kind: "synchronisation",
      priority: "warning",
      title: `Données Jumia possiblement en retard — ${params.shopName}`,
      body:
        `Aucune relecture réussie de ${params.shopName} depuis ${formaterDuree(age)}` +
        (params.syncInProgress ? " (une relecture est en cours)" : "") +
        `. Les commandes affichées peuvent être en retard : la donnée n'est pas garantie à jour.`,
      escalade: false,
    };
  }

  if (!params.lastSyncAt) {
    return {
      kind: "synchronisation",
      priority: "warning",
      title: `Aucune commande synchronisée — ${params.shopName}`,
      body:
        `${params.shopName} n'a encore jamais été relue. Les commandes affichées sont ` +
        `incomplètes tant qu'une synchronisation n'a pas réussi.`,
      escalade: false,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Action proposée
// ---------------------------------------------------------------------------

/**
 * Action adaptée à l'état **courant** de la commande.
 *
 * La commande peut avoir changé entre l'émission de l'alerte et le clic :
 * on interroge donc la base au moment de l'affichage, jamais le contenu
 * figé de l'alerte. Une commande déjà préparée ne propose **pas** une
 * seconde préparation.
 */
export function computeAlertAction(params: {
  kind: OrderAlertKind;
  family: OrderFamily | null;
  orderId: string | null;
  shopId: string;
}): OrderAlertAction {
  if (params.kind === "synchronisation") {
    return {
      kind: "sync",
      label: "Vérifier la synchronisation",
      href: `/commandes?boutique=${encodeURIComponent(params.shopId)}`,
    };
  }
  if (!params.orderId) {
    return {
      kind: "view",
      label: "Voir les commandes",
      href: `/commandes?boutique=${encodeURIComponent(params.shopId)}`,
    };
  }
  if (params.family === "en-attente") {
    return {
      kind: "prepare",
      label: "Voir et préparer",
      href: `/commandes/${params.orderId}`,
    };
  }
  if (params.family === "pretes-a-expedier") {
    return {
      kind: "view",
      label: "Voir la commande",
      href: `/commandes/${params.orderId}`,
    };
  }
  return {
    kind: "view",
    label: "Voir la commande",
    href: `/commandes/${params.orderId}`,
  };
}

// ---------------------------------------------------------------------------
// Base : seuils par boutique
// ---------------------------------------------------------------------------

/** Préfixe des réglages de seuil dans `app_settings`. */
export const CLE_DELAI_PREVENTIF = "alertes.delai_preventif_heures";

/**
 * Seuils préventifs par boutique.
 *
 * Le seuil par défaut est de 24 h. Une boutique peut le fixer
 * différemment (`app_settings`, clé `alertes.delai_preventif_heures.<shopId>`),
 * car les délais de préparation diffèrent d'une boutique et d'un processus à
 * l'autre. L'API Jumia n'expose pas ce délai : c'est donc une donnée
 * **saisie par le vendeur**, jamais une valeur inventée par l'application.
 */
export async function readDeadlines(shopIds: string[]): Promise<Map<string, number>> {
  const ids = shopIds.filter((id) => id.length > 0);
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await getDb()
    .select()
    .from(schema.appSettings)
    .where(sql`${schema.appSettings.key} LIKE ${`${CLE_DELAI_PREVENTIF}.%`}`);
  for (const row of rows) {
    const shopId = row.key.slice(`${CLE_DELAI_PREVENTIF}.`.length);
    if (!ids.includes(shopId)) continue;
    const raw = row.value as { heures?: unknown } | null;
    const hours = typeof raw?.heures === "number" ? raw.heures : Number(raw?.heures);
    if (Number.isFinite(hours) && hours > 0 && hours <= 240) {
      map.set(shopId, hours);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Base : réconciliation
// ---------------------------------------------------------------------------

/** Résultat d'une réconciliation. */
export type ReconcileResult = {
  created: number;
  updated: number;
  resolved: number;
  unchanged: number;
};

/** Clé de déduplication d'une alerte de commande. */
export function dedupeKeyOrder(shopId: string, orderId: string): string {
  return `${shopId}:${orderId}`;
}

/** Clé de déduplication de l'alerte de synchronisation. */
export function dedupeKeySync(shopId: string): string {
  return `${shopId}:synchronisation`;
}

/**
 * Rapproche l'état des alertes de la réalité des commandes.
 *
 * La fonction est **idempotente** : l'appeler deux fois ne crée pas de
 * doublon, ne duplique pas les alertes et ne réveille pas une alerte déjà
 * résolue. Elle :
 * - crée l'alerte d'une commande qui attend une action ;
 * - met à jour son contenu et sa priorité quand la situation évolue ;
 * - **réveille** l'alerte (elle redevient non vue) quand elle escalade ;
 * - résout l'alerte quand la commande ne justifie plus l'alerte.
 */
export async function reconcileOrderAlerts(params: {
  shopIds: string[];
  now?: Date;
}): Promise<ReconcileResult> {
  const now = params.now ?? new Date();
  const shopIds = params.shopIds.filter((id) => id.length > 0);
  const result: ReconcileResult = { created: 0, updated: 0, resolved: 0, unchanged: 0 };
  if (shopIds.length === 0) return result;

  const db = getDb();

  const shops = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      lastSyncStatus: schema.shops.lastSyncStatus,
      lastSyncAt: schema.shops.lastSyncAt,
      syncInProgress: schema.shops.syncInProgress,
      remoteShopId: schema.shops.remoteShopId,
    })
    .from(schema.shops)
    .where(inArray(schema.shops.id, shopIds));

  const deadlines = await readDeadlines(shopIds);

  // --- Commandes qui attendent encore une action -------------------------
  const candidates = await db
    .select({
      id: schema.orders.id,
      shopId: schema.orders.shopId,
      orderNumber: schema.orders.orderNumber,
      externalOrderId: schema.orders.externalOrderId,
      status: schema.orders.status,
      packedItems: schema.orders.packedItems,
      totalItems: schema.orders.totalItems,
      remoteCreatedAt: schema.orders.remoteCreatedAt,
      firstSeenAt: schema.orders.firstSeenAt,
    })
    .from(schema.orders)
    .where(
      and(
        inArray(schema.orders.shopId, shopIds),
        orderFamilyCondition("en-attente"),
      ),
    );

  const candidateIds = candidates.map((row) => row.id);
  const candidateStatuses = await listItemStatusesByOrder(shopIds, candidateIds);

  // --- Alertes déjà ouvertes --------------------------------------------
  const actives = await db
    .select()
    .from(schema.orderAlerts)
    .where(
      and(
        inArray(schema.orderAlerts.shopId, shopIds),
        eq(schema.orderAlerts.status, "active"),
      ),
    );
  const activesByKey = new Map(actives.map((row) => [row.dedupeKey, row]));

  const alertOrderIds = actives
    .map((row) => row.orderId)
    .filter((id): id is string => typeof id === "string");
  const alertOrders = alertOrderIds.length
    ? await db
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          packedItems: schema.orders.packedItems,
          totalItems: schema.orders.totalItems,
        })
        .from(schema.orders)
        .where(inArray(schema.orders.id, alertOrderIds))
    : [];
  const alertOrderById = new Map(alertOrders.map((row) => [row.id, row]));
  const alertOrderStatuses = await listItemStatusesByOrder(shopIds, alertOrderIds);

  // --- Alertes de commande ----------------------------------------------
  for (const order of candidates) {
    const shop = shops.find((row) => row.id === order.shopId);
    if (!shop) continue;
    // La commande doit vraiment attendre une action, statut d'articles
    // compris : la condition SQL et le classement JS doivent dire la même
    // chose.
    const famille = orderFamily({
      status: order.status,
      packedItems: order.packedItems,
      totalItems: order.totalItems,
      itemStatuses: candidateStatuses.get(order.id) ?? [],
    });
    if (famille !== "en-attente") continue;

    const computed = computeOrderAlert({
      now,
      shopName: shop.name,
      orderNumber: order.orderNumber,
      externalOrderId: order.externalOrderId,
      remoteCreatedAt: order.remoteCreatedAt,
      firstSeenAt: order.firstSeenAt,
      deadlineHours: deadlines.get(order.shopId),
    });

    const key = dedupeKeyOrder(order.shopId, order.id);
    const existing = activesByKey.get(key);
    const metadata = {
      ageHours: Math.round(computed.ageHours * 100) / 100,
      deadlineHours: computed.deadlineHours,
      receptionAt: (order.firstSeenAt ?? order.remoteCreatedAt)?.toISOString() ?? null,
      orderCreatedAt: order.remoteCreatedAt?.toISOString() ?? null,
      orderNumber: order.orderNumber,
      externalOrderId: order.externalOrderId,
      family: famille,
    };

    if (!existing) {
      await db.insert(schema.orderAlerts).values({
        shopId: order.shopId,
        orderId: order.id,
        kind: computed.kind,
        dedupeKey: key,
        priority: computed.priority,
        title: computed.title,
        body: computed.body,
        status: "active",
        firstDetectedAt: now,
        updatedAt: now,
        metadata,
      });
      activesByKey.set(key, {
        id: "",
        shopId: order.shopId,
        orderId: order.id,
        kind: computed.kind,
        dedupeKey: key,
        priority: computed.priority,
        title: computed.title,
        body: computed.body,
        status: "active",
        firstDetectedAt: now,
        updatedAt: now,
        resolvedAt: null,
        resolution: null,
        metadata,
      });
      result.created += 1;
      continue;
    }

    const changed =
      existing.kind !== computed.kind ||
      existing.priority !== computed.priority ||
      existing.title !== computed.title ||
      existing.body !== computed.body;
    if (!changed) {
      result.unchanged += 1;
      continue;
    }

    await db
      .update(schema.orderAlerts)
      .set({
        kind: computed.kind,
        priority: computed.priority,
        title: computed.title,
        body: computed.body,
        updatedAt: now,
        metadata,
      })
      .where(eq(schema.orderAlerts.id, existing.id));

    // Une escalade réveille l'alerte : elle redevient non vue pour tout le
    // monde, car la situation s'est aggravée.
    const escalade =
      RANG_PRIORITE[computed.priority] > RANG_PRIORITE[existing.priority as OrderAlertPriority];
    if (escalade) {
      await db.delete(schema.orderAlertReads).where(eq(schema.orderAlertReads.alertId, existing.id));
    }
    result.updated += 1;
  }

  // --- Résolution des alertes qui ne sont plus justifiées ----------------
  const candidateIdsSet = new Set(candidates.map((row) => row.id));
  for (const alert of actives) {
    if (alert.kind === "synchronisation") continue;
    if (!alert.orderId) continue;
    if (candidateIdsSet.has(alert.orderId)) continue;
    const order = alertOrderById.get(alert.orderId);
    const raison = order
      ? raisonResolution(order, alertOrderStatuses.get(alert.orderId) ?? [])
      : "La commande n'existe plus.";
    await db
      .update(schema.orderAlerts)
      .set({ status: "resolved", resolvedAt: now, updatedAt: now, resolution: raison })
      .where(eq(schema.orderAlerts.id, alert.id));
    result.resolved += 1;
  }

  // --- Alerte de synchronisation -----------------------------------------
  for (const shop of shops) {
    const key = dedupeKeySync(shop.id);
    const computed = computeSyncAlert({
      shopName: shop.name,
      lastSyncStatus: shop.lastSyncStatus,
      lastSyncAt: shop.lastSyncAt,
      syncInProgress: shop.syncInProgress,
      attached: Boolean(shop.remoteShopId),
      now,
    });
    const existing = activesByKey.get(key);

    if (!computed) {
      if (existing) {
        await db
          .update(schema.orderAlerts)
          .set({
            status: "resolved",
            resolvedAt: now,
            updatedAt: now,
            resolution: "La synchronisation est à jour.",
          })
          .where(eq(schema.orderAlerts.id, existing.id));
        result.resolved += 1;
      }
      continue;
    }

    const metadata = {
      lastSyncStatus: shop.lastSyncStatus,
      lastSyncAt: shop.lastSyncAt?.toISOString() ?? null,
    };

    if (!existing) {
      await db.insert(schema.orderAlerts).values({
        shopId: shop.id,
        orderId: null,
        kind: "synchronisation",
        dedupeKey: key,
        priority: computed.priority,
        title: computed.title,
        body: computed.body,
        status: "active",
        firstDetectedAt: now,
        updatedAt: now,
        metadata,
      });
      result.created += 1;
      continue;
    }

    const changed =
      existing.priority !== computed.priority ||
      existing.title !== computed.title ||
      existing.body !== computed.body;
    if (!changed) {
      result.unchanged += 1;
      continue;
    }
    await db
      .update(schema.orderAlerts)
      .set({
        priority: computed.priority,
        title: computed.title,
        body: computed.body,
        updatedAt: now,
        metadata,
      })
      .where(eq(schema.orderAlerts.id, existing.id));
    const escalade =
      RANG_PRIORITE[computed.priority] > RANG_PRIORITE[existing.priority as OrderAlertPriority];
    if (escalade) {
      await db.delete(schema.orderAlertReads).where(eq(schema.orderAlertReads.alertId, existing.id));
    }
    result.updated += 1;
  }

  return result;
}

/** Raison de résolution d'une alerte de commande, lisible par le vendeur. */
export function raisonResolution(
  order: { status: string; packedItems: number | null; totalItems: number | null },
  itemStatuses: string[],
): string {
  const famille = orderFamily({
    status: order.status,
    packedItems: order.packedItems,
    totalItems: order.totalItems,
    itemStatuses,
  });
  switch (famille) {
    case "pretes-a-expedier":
      return "La commande est préparée : elle n'attend plus d'action.";
    case "expediees":
      return "La commande a été expédiée.";
    case "livrees":
      return "La commande a été livrée.";
    case "annulees":
      return "La commande a été annulée.";
    case "echec-livraison":
      return "La commande a échoué à la livraison.";
    case "retours":
      return "La commande est en retour.";
    default:
      return "La commande n'attend plus d'action.";
  }
}

// ---------------------------------------------------------------------------
// Base : lecture
// ---------------------------------------------------------------------------

/** Alerte présentée à l'utilisateur. */
export type OrderAlertView = {
  id: string;
  kind: OrderAlertKind;
  priority: OrderAlertPriority;
  title: string;
  body: string;
  shopId: string;
  shopName: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string | null;
  firstDetectedAt: string;
  updatedAt: string;
  /** L'utilisateur a-t-il déjà vu cette alerte ? */
  read: boolean;
  /** Action adaptée à l'état courant de la commande. */
  action: OrderAlertAction;
};

/**
 * Alertes actives du périmètre de l'utilisateur.
 *
 * L'alerte est **partagée** (elle décrit la situation de la commande), mais
 * la lecture est **personnelle** : une commande reçue pendant l'absence
 * d'un gestionnaire reste « non vue » pour lui.
 */
export async function listActiveOrderAlerts(params: {
  userId: string;
  shopIds: string[];
  limit?: number;
}): Promise<OrderAlertView[]> {
  const shopIds = params.shopIds.filter((id) => id.length > 0);
  if (shopIds.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({
      id: schema.orderAlerts.id,
      kind: schema.orderAlerts.kind,
      priority: schema.orderAlerts.priority,
      title: schema.orderAlerts.title,
      body: schema.orderAlerts.body,
      shopId: schema.orderAlerts.shopId,
      shopName: schema.shops.name,
      orderId: schema.orderAlerts.orderId,
      orderNumber: schema.orders.orderNumber,
      externalOrderId: schema.orders.externalOrderId,
      firstDetectedAt: schema.orderAlerts.firstDetectedAt,
      updatedAt: schema.orderAlerts.updatedAt,
      readAt: schema.orderAlertReads.readAt,
      status: schema.orders.status,
      packedItems: schema.orders.packedItems,
      totalItems: schema.orders.totalItems,
    })
    .from(schema.orderAlerts)
    .innerJoin(schema.shops, eq(schema.orderAlerts.shopId, schema.shops.id))
    .leftJoin(schema.orders, eq(schema.orderAlerts.orderId, schema.orders.id))
    .leftJoin(
      schema.orderAlertReads,
      and(
        eq(schema.orderAlertReads.alertId, schema.orderAlerts.id),
        eq(schema.orderAlertReads.userId, params.userId),
      ),
    )
    .where(
      and(
        inArray(schema.orderAlerts.shopId, shopIds),
        eq(schema.orderAlerts.status, "active"),
      ),
    )
    .orderBy(
      sql`CASE ${schema.orderAlerts.priority}
            WHEN 'critical' THEN 0
            WHEN 'warning' THEN 1
            ELSE 2 END`,
      desc(schema.orderAlerts.updatedAt),
    )
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 200));

  const orderIds = rows.map((row) => row.orderId).filter((id): id is string => Boolean(id));
  const statuses = await listItemStatusesByOrder(shopIds, orderIds);

  return rows.map((row) => {
    const famille = row.orderId
      ? orderFamily({
          status: row.status ?? "",
          packedItems: row.packedItems,
          totalItems: row.totalItems,
          itemStatuses: statuses.get(row.orderId) ?? [],
        })
      : null;
    return {
      id: row.id,
      kind: row.kind as OrderAlertKind,
      priority: row.priority as OrderAlertPriority,
      title: row.title,
      body: row.body,
      shopId: row.shopId,
      shopName: row.shopName,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      externalOrderId: row.externalOrderId,
      firstDetectedAt: row.firstDetectedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      read: Boolean(row.readAt),
      action: computeAlertAction({
        kind: row.kind as OrderAlertKind,
        family: famille,
        orderId: row.orderId,
        shopId: row.shopId,
      }),
    };
  });
}

/** Nombre d'alertes actives non vues par l'utilisateur. */
export async function countUnreadOrderAlerts(params: {
  userId: string;
  shopIds: string[];
}): Promise<number> {
  const shopIds = params.shopIds.filter((id) => id.length > 0);
  if (shopIds.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ id: schema.orderAlerts.id })
    .from(schema.orderAlerts)
    .leftJoin(
      schema.orderAlertReads,
      and(
        eq(schema.orderAlertReads.alertId, schema.orderAlerts.id),
        eq(schema.orderAlertReads.userId, params.userId),
      ),
    )
    .where(
      and(
        inArray(schema.orderAlerts.shopId, shopIds),
        eq(schema.orderAlerts.status, "active"),
        sql`${schema.orderAlertReads.alertId} IS NULL`,
      ),
    );
  return rows.length;
}

/** Marque une alerte comme vue par l'utilisateur. */
export async function markOrderAlertRead(params: {
  userId: string;
  alertId: string;
}): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.orderAlerts.id, shopId: schema.orderAlerts.shopId })
    .from(schema.orderAlerts)
    .where(eq(schema.orderAlerts.id, params.alertId))
    .limit(1);
  const alert = rows[0];
  if (!alert) return false;

  await db
    .insert(schema.orderAlertReads)
    .values({ alertId: alert.id, userId: params.userId, readAt: new Date() })
    .onConflictDoNothing();
  return true;
}

/** Alertes résolues récemment (historique, pour la page « Alertes »). */
export async function listResolvedOrderAlerts(params: {
  shopIds: string[];
  limit?: number;
}): Promise<
  { id: string; kind: OrderAlertKind; title: string; resolvedAt: string; resolution: string | null }[]
> {
  const shopIds = params.shopIds.filter((id) => id.length > 0);
  if (shopIds.length === 0) return [];
  const rows = await getDb()
    .select({
      id: schema.orderAlerts.id,
      kind: schema.orderAlerts.kind,
      title: schema.orderAlerts.title,
      resolvedAt: schema.orderAlerts.resolvedAt,
      resolution: schema.orderAlerts.resolution,
    })
    .from(schema.orderAlerts)
    .where(
      and(
        inArray(schema.orderAlerts.shopId, shopIds),
        eq(schema.orderAlerts.status, "resolved"),
      ),
    )
    .orderBy(desc(schema.orderAlerts.resolvedAt))
    .limit(Math.min(Math.max(params.limit ?? 20, 1), 100));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as OrderAlertKind,
    title: row.title,
    resolvedAt: (row.resolvedAt ?? row.resolvedAt)?.toISOString() ?? new Date(0).toISOString(),
    resolution: row.resolution,
  }));
}
