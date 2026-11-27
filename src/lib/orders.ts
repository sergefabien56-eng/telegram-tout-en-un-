import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  max,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { getDb, schema } from "@/db";
import { minorUnits } from "@/lib/money";
import {
  ITEM_STATUS_A_TRAITER,
  ITEM_STATUS_PRET,
  STATUS_ANNULEES,
  STATUS_ECHEC_LIVRAISON,
  STATUS_EN_ATTENTE,
  STATUS_EXPEDIEES,
  STATUS_LIVREES,
  STATUS_RETOURS,
  type OrderFamily,
} from "@/lib/order-status";

export type OrderInsert = typeof schema.orders.$inferInsert;
export type OrderRow = typeof schema.orders.$inferSelect;

/** Convertit un montant décimal (Jumia) en entier d'unités mineures (R3). */
export function toMinorUnits(value: unknown, currency: string): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const fractionDigits = minorUnits(currency);
  // `toFixed` arrondit sur la représentation décimale, plus fiable qu'un
  // simple multiplication (12.345 * 100 vaut 1234.4999… en virgule flottante).
  const fixed = Number(numeric.toFixed(fractionDigits));
  const factor = 10 ** fractionDigits;
  const minor = Math.round(fixed * factor);
  return Number.isSafeInteger(minor) ? minor : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalise une commande GOP vers le schéma local.
 *
 * Retourne `null` si l'identifiant ou le statut manque : on n'enregistre jamais
 * une entrée incomplète (R1). Montants entiers + devise (R3), dates UTC.
 */
export function normalizeOrder(shopId: string, raw: unknown): OrderInsert | null {
  const order = raw as {
    id?: unknown;
    number?: unknown;
    status?: unknown;
    totalAmount?: { currency?: unknown; value?: unknown };
    totalAmountLocal?: { currency?: unknown; value?: unknown };
    country?: { code?: unknown };
    shippingAddress?: { firstName?: unknown; lastName?: unknown; city?: unknown };
    totalItems?: unknown;
    packedItems?: unknown;
    isPrepayment?: unknown;
    hasMultipleStatus?: unknown;
    deliveryOption?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const externalOrderId = asString(order.id);
  const status = asString(order.status);
  if (!externalOrderId || !status) return null;

  // `totalAmount` est en USD sur Vendor Center ; `totalAmountLocal` porte la
  // devise du pays. On privilégie le montant local, avec repli sur l'USD.
  const localCurrency = asString(order.totalAmountLocal?.currency) ?? "XOF";
  const localValue = toMinorUnits(order.totalAmountLocal?.value, localCurrency);
  const usdCurrency = asString(order.totalAmount?.currency) ?? "USD";
  const usdValue = toMinorUnits(order.totalAmount?.value, usdCurrency);

  return {
    shopId,
    externalOrderId,
    orderNumber: asString(order.number),
    status,
    countryCode: asString(order.country?.code),
    currency: localCurrency,
    totalAmountMinor: localValue ?? 0,
    totalAmountUsdMinor: usdValue,
    totalItems: asInt(order.totalItems),
    packedItems: asInt(order.packedItems),
    isPrepayment: Boolean(order.isPrepayment),
    hasMultipleStatus: Boolean(order.hasMultipleStatus),
    deliveryOption: asString(order.deliveryOption),
    customerFirstName: asString(order.shippingAddress?.firstName),
    customerLastName: asString(order.shippingAddress?.lastName),
    customerCity: asString(order.shippingAddress?.city),
    remoteCreatedAt: asDate(order.createdAt),
    remoteUpdatedAt: asDate(order.updatedAt),
    raw: raw as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

/**
 * Insère ou met à jour des commandes (upsert idempotent par boutique + id distant).
 *
 * Le décompte inséré / mis à jour est établi en comparant aux identifiants
 * déjà présents, sans requête supplémentaire par ligne.
 */
export async function upsertOrders(rows: OrderInsert[]): Promise<{
  processed: number;
  inserted: number;
  updated: number;
}> {
  if (rows.length === 0) return { processed: 0, inserted: 0, updated: 0 };

  const first = rows[0];
  if (!first) return { processed: 0, inserted: 0, updated: 0 };
  const shopId = first.shopId;

  // Garde-fou d'isolation : un lot ne peut concerner qu'une seule boutique.
  // Contrôle fait AVANT toute ouverture de connexion : un lot multi-boutiques
  // ne doit jamais atteindre la base, même en lecture.
  const batchShops = new Set(rows.map((row) => row.shopId));
  if (batchShops.size > 1) {
    throw new Error(
      `Lot de commandes multi-boutiques refusé (${batchShops.size} boutiques) : chaque synchronisation ne porte que sur une boutique.`,
    );
  }

  const db = getDb();
  const externalIds = rows.flatMap((row) => (row.externalOrderId ? [row.externalOrderId] : []));
  const existing = new Set(
    (
      await db
        .select({ id: schema.orders.externalOrderId })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.shopId, shopId),
            inArray(schema.orders.externalOrderId, externalIds),
          ),
        )
    ).map((row) => row.id),
  );

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    await db
      .insert(schema.orders)
      // `firstSeenAt` est l'instant où l'application a reçu la commande la
      // première fois : il est posé à l'insertion et **jamais** réécrit
      // ensuite (la clause de conflit ne le touche pas).
      .values({ ...row, firstSeenAt: row.firstSeenAt ?? new Date() })
      .onConflictDoUpdate({
        target: [schema.orders.shopId, schema.orders.externalOrderId],
        set: {
          orderNumber: row.orderNumber,
          status: row.status,
          countryCode: row.countryCode,
          currency: row.currency,
          totalAmountMinor: row.totalAmountMinor,
          totalAmountUsdMinor: row.totalAmountUsdMinor,
          totalItems: row.totalItems,
          packedItems: row.packedItems,
          isPrepayment: row.isPrepayment,
          hasMultipleStatus: row.hasMultipleStatus,
          deliveryOption: row.deliveryOption,
          customerFirstName: row.customerFirstName,
          customerLastName: row.customerLastName,
          customerCity: row.customerCity,
          remoteCreatedAt: row.remoteCreatedAt,
          remoteUpdatedAt: row.remoteUpdatedAt,
          raw: row.raw,
          syncedAt: row.syncedAt,
        },
      });
    // Les identifiants sont propres à la boutique, d'où le filtre ci-dessus.
    const wasPresent = externalIds.length > 0 && existingHas(existing, row.externalOrderId);
    if (wasPresent) updated += 1;
    else inserted += 1;
  }

  return { processed: rows.length, inserted, updated };
}

function existingHas(set: Set<string>, value: string | null): boolean {
  return value !== null && set.has(value);
}

/** Commandes enregistrées pour une boutique (plus récentes d'abord). */
export async function listOrders(shopId: string, limit = 100): Promise<OrderRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.shopId, shopId))
    .orderBy(desc(schema.orders.remoteCreatedAt), desc(schema.orders.syncedAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

// ---------------------------------------------------------------------------
// Rubriques « Ventes et commandes »
// ---------------------------------------------------------------------------

/**
 * Groupes de statuts Jumia (GOP) par rubrique métier.
 *
 * Libellés de la plateforme, normalisés en minuscules sans séparateur
 * (`PickedUp` → `pickedup`). Les statuts livrés (`delivered`) ne sont volontairement
 * dans aucun groupe : ils restent consultables via « Toutes les commandes ».
 */
export const ORDER_STATUS_GROUPS = {
  action: ["created", "pending", "processing", "new"],
  shipped: ["shipped", "pickedup"],
  returned: ["returned", "refunded", "returnrequested", "rma"],
} as const;

export type OrderGroup = keyof typeof ORDER_STATUS_GROUPS;

function normalizeStatus(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Rubrique concernée par un statut, ou `null` si aucun groupe ne s'applique. */
export function orderStatusGroup(status: string): OrderGroup | null {
  const normalized = normalizeStatus(status);
  for (const [group, statuses] of Object.entries(ORDER_STATUS_GROUPS) as [
    OrderGroup,
    readonly string[],
  ][]) {
    if (statuses.includes(normalized)) return group;
  }
  return null;
}

export type OrderFilters = {
  /**
   * Famille de commandes retenue (filtre appliqué **en base**, avant la
   * limite de lignes).
   */
  family?: OrderFamily;
  /** Statut exact Jumia (ex. `SHIPPED`). */
  status?: string;
  /** Boutiques autorisées ; jamais de requête hors de cette liste. */
  shopIds?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
};

/**
 * Commandes enregistrées sur une liste de boutiques, avec le nom de la boutique.
 * La liste `shopIds` vient toujours de `listUserShops` : on ne sort jamais du
 * périmètre autorisé.
 */
/**
 * Condition SQL correspondant à une famille de commandes.
 *
 * Elle reprend exactement les définitions de `order-status.ts` : le filtrage
 * se fait **en base**, avant la limite de lignes, afin que la liste affichée
 * et les compteurs décrivent le même ensemble.
 *
 * Les fragments SQL sont construits **à l'appel** et non au chargement du
 * module : certains tests simulent la base (`schema` vide), et le module doit
 * rester importable sans elle.
 */
/**
 * Expression SQL donnant la **famille** d'une commande.
 *
 * C'est le miroir exact de `orderFamily()` (JS) : les compteurs affichés
 * (calculés en base) et la classification des listes ne peuvent donc pas
 * diverger.
 *
 * Cas particulier : quand le statut agrégé de la commande n'est pas un
 * statut connu (« Multiple Status »), la décision revient aux **articles**.
 * Le statut global de Jumia ne dit alors rien de ce qu'il reste à faire,
 * et `packedItems` compte les articles emballés — y compris ceux qui ont
 * ensuite été annulés ou livrés. Une commande dont tous les articles sont
 * clos n'a rien à préparer : elle ne doit pas apparaître dans « À traiter ».
 */
/**
 * Liste de statuts rendue **en littéral SQL**.
 *
 * Les valeurs viennent de constantes internes (les listes de statuts du
 * projet), jamais d'une saisie utilisateur. Le littéral est nécessaire :
 * l'expression doit être **strictement identique** dans le SELECT et le
 * GROUP BY, ce qui n'est pas le cas avec des paramètres liés (Postgres
 * compare les expressions après analyse, les `$1` et `$5` n'y sont pas
 * interchangeables).
 */
function listeStatuts(values: readonly string[]): SQL {
  const litteral = values
    .map((value) => `'${value.replace(/'/g, "''")}'`)
    .join(", ");
  return sql.raw(litteral);
}

export function orderFamilySql(): SQL {
  // Statut Jumia normalisé : minuscules, sans espace, sans tiret ni
  // soubassement — même normalisation que `normalizeOrderStatus` en JS.
  const statut = sql`lower(regexp_replace(regexp_replace(regexp_replace(trim(${schema.orders.status}), '[\\s_-]+', '', 'g'), ' ', '', 'g'), '_', '', 'g'))`;

  // Même normalisation, appliquée au statut d'un **article**.
  const statutArticle = sql`lower(regexp_replace(regexp_replace(regexp_replace(trim(i.status), '[\\s_-]+', '', 'g'), ' ', '', 'g'), '_', '', 'g'))`;

  // Préparation confirmée : tous les articles sont emballés
  // (`packed >= total > 0`), ou — quand le total d'articles est inconnu —
  // le statut dit « prêt à expédier ».
  const preparation = sql`(
    (coalesce(${schema.orders.totalItems}, 0) > 0 AND coalesce(${schema.orders.packedItems}, 0) >= ${schema.orders.totalItems})
    OR (coalesce(${schema.orders.totalItems}, 0) = 0 AND ${statut} = 'readytoship')
  )`;

  const articleExiste = sql`EXISTS (
    SELECT 1 FROM ${schema.orderItems} i WHERE i.order_id = ${schema.orders.id}
  )`;
  const articleATraiter = sql`EXISTS (
    SELECT 1 FROM ${schema.orderItems} i
     WHERE i.order_id = ${schema.orders.id}
       AND ${statutArticle} IN (${listeStatuts(ITEM_STATUS_A_TRAITER)})
  )`;
  const articleATraiterPasPret = sql`EXISTS (
    SELECT 1 FROM ${schema.orderItems} i
     WHERE i.order_id = ${schema.orders.id}
       AND ${statutArticle} IN (${listeStatuts(ITEM_STATUS_A_TRAITER)})
       AND ${statutArticle} NOT IN (${listeStatuts(ITEM_STATUS_PRET)})
  )`;
  const avecArticle = (statuts: readonly string[]) => sql`EXISTS (
    SELECT 1 FROM ${schema.orderItems} i
     WHERE i.order_id = ${schema.orders.id}
       AND ${statutArticle} IN (${listeStatuts(statuts)})
  )`;

  return sql`CASE
    WHEN ${statut} IN (${listeStatuts(STATUS_ANNULEES)}) THEN 'annulees'
    WHEN ${statut} IN (${listeStatuts(STATUS_ECHEC_LIVRAISON)}) THEN 'echec-livraison'
    WHEN ${statut} IN (${listeStatuts(STATUS_RETOURS)}) THEN 'retours'
    WHEN ${statut} IN (${listeStatuts(STATUS_LIVREES)}) THEN 'livrees'
    WHEN ${statut} IN (${listeStatuts(STATUS_EXPEDIEES)}) THEN 'expediees'
    WHEN ${statut} IN (${listeStatuts(STATUS_EN_ATTENTE)}) THEN (CASE WHEN ${preparation} THEN 'pretes-a-expedier' ELSE 'en-attente' END)
    WHEN ${statut} = 'readytoship' THEN 'pretes-a-expedier'
    ELSE (CASE
      WHEN NOT ${articleExiste} THEN (CASE WHEN ${preparation} THEN 'pretes-a-expedier' ELSE 'en-attente' END)
      WHEN ${articleATraiterPasPret} THEN 'en-attente'
      WHEN ${articleATraiter} THEN 'pretes-a-expedier'
      WHEN ${avecArticle(STATUS_LIVREES)} THEN 'livrees'
      WHEN ${avecArticle(STATUS_EXPEDIEES)} THEN 'expediees'
      WHEN ${avecArticle(STATUS_ECHEC_LIVRAISON)} THEN 'echec-livraison'
      WHEN ${avecArticle(STATUS_RETOURS)} THEN 'retours'
      WHEN ${avecArticle(STATUS_ANNULEES)} THEN 'annulees'
      ELSE 'en-attente'
    END)
  END`;
}

export function orderFamilyCondition(famille: OrderFamily): SQL {
  const familleSql = orderFamilySql();
  if (famille === "hors-annulees") {
    // Historique : tout sauf les annulées, qui ont leur propre sous-vue.
    return sql`${familleSql} <> 'annulees'`;
  }
  return sql`${familleSql} = ${famille}`;
}

export async function listOrdersForShops(
  shopIds: string[],
  filters: OrderFilters = {},
): Promise<{ order: OrderRow; shopName: string }[]> {
  const ids = shopIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];
  const db = getDb();
  const conditions = [inArray(schema.orders.shopId, ids)];
  if (filters.status) conditions.push(eq(schema.orders.status, filters.status));
  if (filters.from) conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  if (filters.to) conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));
  if (filters.family) conditions.push(orderFamilyCondition(filters.family));

  return (
    db
      .select({ order: schema.orders, shopName: schema.shops.name })
      .from(schema.orders)
      .innerJoin(schema.shops, eq(schema.orders.shopId, schema.shops.id))
      .where(and(...conditions))
      .orderBy(desc(schema.orders.remoteCreatedAt))
      // Plafond haut : les exports doivent couvrir toute la sélection, pas
      // une page tronquée. Les vues d'écran demandent une limite beaucoup
      // plus basse.
      .limit(Math.min(Math.max(filters.limit ?? 100, 1), 5000))
  );
}

/**
 * Clients dérivés des commandes enregistrées : identité + ville uniquement.
 * Aucun téléphone ni adresse n'est stocké dans notre base, donc rien de plus
 * n'est exposé (protection des données personnelles).
 */
export async function listOrderCustomers(
  shopIds: string[],
  limit = 200,
): Promise<
  {
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    commands: number;
    lastAt: Date | null;
    totalMinor: number;
  }[]
> {
  const ids = shopIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      firstName: schema.orders.customerFirstName,
      lastName: schema.orders.customerLastName,
      city: schema.orders.customerCity,
      commands: count(),
      lastAt: max(schema.orders.remoteCreatedAt),
      totalMinor: sum(schema.orders.totalAmountMinor),
    })
    .from(schema.orders)
    .where(and(inArray(schema.orders.shopId, ids), isNotNull(schema.orders.customerFirstName)))
    .groupBy(
      schema.orders.customerFirstName,
      schema.orders.customerLastName,
      schema.orders.customerCity,
    )
    .orderBy(desc(count()))
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => ({
    firstName: row.firstName,
    lastName: row.lastName,
    city: row.city,
    commands: row.commands,
    lastAt: row.lastAt,
    totalMinor: row.totalMinor === null ? 0 : Number(row.totalMinor),
  }));
}

/**
 * Compteurs d'une sélection de commandes, **sans** limite de lignes.
 *
 * Le nombre affiché doit correspondre aux filtres posés, pas au nombre de
 * lignes effectivement renvoyées par une requête tronquée.
 */
/**
 * Compteurs d'une sélection de commandes, **sans** limite de lignes.
 *
 * Le nombre affiché doit correspondre aux filtres posés, pas au nombre de
 * lignes effectivement renvoyées par une requête tronquée.
 *
 * `include` permet de restreindre le périmètre à une famille de commandes
 * (par exemple « annulée ») : les compteurs décrivent alors exactement ce
 * que la page affiche, et le total affiché correspond bien aux commandes
 * listées.
 */
export async function countOrdersForShops(
  shopIds: string[],
  filters: OrderFilters = {},
  include?: (order: { family: OrderFamily }) => boolean,
): Promise<{ orders: number; totalMinor: number; currencies: string[] }> {
  const ids = shopIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return { orders: 0, totalMinor: 0, currencies: [] };
  const db = getDb();
  const conditions = [inArray(schema.orders.shopId, ids)];
  if (filters.status) conditions.push(eq(schema.orders.status, filters.status));
  if (filters.from) conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  if (filters.to) conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));
  if (filters.family) conditions.push(orderFamilyCondition(filters.family));

  // Le regroupement se fait sur la **famille** — la même définition que celle
  // du filtre SQL et que celle du code JS. Le total affiché reste ainsi le
  // montant exact des commandes listées.
  // L'expression doit être **la même** dans le SELECT et le GROUP BY :
  // c'est Postgres qui exige que les colonnes citées par une expression
  // groupée le soient aussi.
  const familleSql = orderFamilySql();
  const rows = await db
    .select({
      orders: count(),
      totalMinor: sum(schema.orders.totalAmountMinor),
      currency: schema.orders.currency,
      family: familleSql,
    })
    .from(schema.orders)
    .where(and(...conditions))
    .groupBy(schema.orders.currency, familleSql);

  let orders = 0;
  let totalMinor = 0;
  const currencies = new Set<string>();
  for (const row of rows) {
    const nombre = Number(row.orders ?? 0);
    if (include && !include({ family: row.family as OrderFamily })) {
      continue;
    }
    orders += nombre;
    totalMinor += Number(row.totalMinor ?? 0);
    if (row.currency) currencies.add(row.currency);
  }

  return { orders, totalMinor, currencies: [...currencies] };
}

/**
 * Agrégat par ville (ou localité) — **sans donnée personnelle**.
 *
 * On ne restitue que des volumes, des montants et des taux d'échec, avec
 * l'effectif correspondant : un pourcentage seul serait trompeur sur un
 * échantillon minuscule. Aucun nom, téléphone ou adresse n'est exposé.
 */
export async function listOrderCities(
  shopIds: string[],
  filters: OrderFilters = {},
): Promise<
  {
    city: string;
    orders: number;
    delivered: number;
    shipped: number;
    canceled: number;
    failed: number;
    returned: number;
    totalMinor: number;
    currency: string;
  }[]
> {
  const ids = shopIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];
  const db = getDb();
  const conditions = [inArray(schema.orders.shopId, ids), isNotNull(schema.orders.customerCity)];
  if (filters.from) conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  if (filters.to) conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));

  const familleSql = orderFamilySql();
  const rows = await db
    .select({
      city: schema.orders.customerCity,
      currency: schema.orders.currency,
      family: familleSql,
      totalMinor: sum(schema.orders.totalAmountMinor),
      n: count(),
    })
    .from(schema.orders)
    .where(and(...conditions))
    .groupBy(schema.orders.customerCity, schema.orders.currency, familleSql);

  const parVille = new Map<
    string,
    {
      city: string;
      orders: number;
      delivered: number;
      shipped: number;
      canceled: number;
      failed: number;
      returned: number;
      totalMinor: number;
      currency: string;
    }
  >();

  for (const row of rows) {
    const city = (row.city ?? "").trim();
    if (!city) continue;
    const entry = parVille.get(city) ?? {
      city,
      orders: 0,
      delivered: 0,
      shipped: 0,
      canceled: 0,
      failed: 0,
      returned: 0,
      totalMinor: 0,
      currency: row.currency,
    };
    const nombre = Number(row.n ?? 0);
    entry.orders += nombre;
    entry.totalMinor += Number(row.totalMinor ?? 0);
    // La famille vient de la base : elle est donc exactement celle du filtre
    // appliqué aux listes (aucune divergence possible entre l'agrégat et
    // les sous-vues).
    const famille = row.family as OrderFamily;
    if (famille === "livrees") entry.delivered += nombre;
    else if (famille === "expediees") entry.shipped += nombre;
    else if (famille === "annulees") entry.canceled += nombre;
    else if (famille === "echec-livraison") entry.failed += nombre;
    else if (famille === "retours") entry.returned += nombre;
    parVille.set(city, entry);
  }

  return [...parVille.values()].sort((a, b) => b.orders - a.orders);
}

/**
 * Une commande, avec sa boutique, pour la page de détail.
 *
 * Le périmètre est vérifié **côté serveur** : une commande qui n'appartient
 * pas à une boutique autorisée n'est jamais renvoyée.
 */
export async function getOrderForUser(
  orderId: string,
  allowedShopIds: string[],
): Promise<(OrderRow & { shopName: string }) | null> {
  if (allowedShopIds.length === 0) return null;
  const db = getDb();
  const rows = await db
    .select({ order: schema.orders, shopName: schema.shops.name })
    .from(schema.orders)
    .innerJoin(schema.shops, eq(schema.orders.shopId, schema.shops.id))
    .where(and(eq(schema.orders.id, orderId), inArray(schema.orders.shopId, allowedShopIds)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row.order, shopName: row.shopName };
}
