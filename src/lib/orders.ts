import { and, count, desc, eq, gte, inArray, isNotNull, lte, max, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { minorUnits } from "@/lib/money";

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
      .values(row)
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
export async function listOrdersForShops(
  shopIds: string[],
  filters: OrderFilters = {},
): Promise<{ order: OrderRow; shopName: string }[]> {
  if (shopIds.length === 0) return [];
  const db = getDb();
  const conditions = [inArray(schema.orders.shopId, shopIds)];
  if (filters.status) conditions.push(eq(schema.orders.status, filters.status));
  if (filters.from) conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  if (filters.to) conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));

  return db
    .select({ order: schema.orders, shopName: schema.shops.name })
    .from(schema.orders)
    .innerJoin(schema.shops, eq(schema.orders.shopId, schema.shops.id))
    .where(and(...conditions))
    .orderBy(desc(schema.orders.remoteCreatedAt))
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));
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
  if (shopIds.length === 0) return [];
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
    .where(and(inArray(schema.orders.shopId, shopIds), isNotNull(schema.orders.customerFirstName)))
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
