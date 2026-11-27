import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { toMinorUnits } from "@/lib/orders";
import type { JumiaOrderItem } from "@/lib/jumia/order-items";

export type OrderItemInsert = typeof schema.orderItems.$inferInsert;
export type OrderItemRow = typeof schema.orderItems.$inferSelect;

/**
 * Normalise un article Jumia vers la ligne locale.
 *
 * `orderId` est la clé étrangère **locale** de la commande : l'article est
 * toujours rattaché à une commande que nous avons déjà enregistrée. Un
 * article sans commande locale n'est pas enregistrable — il n'apartiendrait
 * à rien dans l'interface.
 */
export function normalizeOrderItem(params: {
  shopId: string;
  orderId: string;
  raw: JumiaOrderItem;
}): OrderItemInsert {
  const { shopId, orderId, raw } = params;
  const currency = raw.currency ?? "XOF";

  return {
    shopId,
    orderId,
    externalItemId: raw.id,
    status: raw.status,
    trackingNumber: raw.trackingNumber,
    trackingUrl: raw.trackingUrl,
    shipmentType: raw.shipmentType,
    deliveryOption: raw.deliveryOption,
    isFulfilledByJumia: raw.isFulfilledByJumia,
    productName: raw.productName,
    sellerSku: raw.sellerSku,
    productImageUrl: raw.productImageUrl,
    countryCode: raw.countryCode,
    currency,
    itemPriceMinor: toMinorUnits(raw.itemPriceLocal, currency),
    paidPriceMinor: toMinorUnits(raw.paidPriceLocal, currency),
    shippingAmountMinor: toMinorUnits(raw.shippingAmountLocal, currency),
    shippedDate: raw.shippedDate ? new Date(raw.shippedDate) : null,
    raw: raw as unknown as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

/**
 * Insère ou met à jour des articles (idempotent par commande + identifiant
 * d'article distant).
 *
 * Un lot ne peut concerner qu'une seule boutique : le contrôle est fait
 * **avant** toute ouverture de connexion.
 */
export async function upsertOrderItems(rows: OrderItemInsert[]): Promise<{
  processed: number;
  inserted: number;
  updated: number;
}> {
  if (rows.length === 0) return { processed: 0, inserted: 0, updated: 0 };

  const shopIds = new Set(rows.map((row) => row.shopId));
  if (shopIds.size > 1) {
    throw new Error(
      `Lot d'articles multi-boutiques refusé (${shopIds.size} boutiques) : chaque synchronisation ne porte que sur une boutique.`,
    );
  }

  const db = getDb();

  // Les articles déjà connus sont lus **en une seule requête** : un `SELECT`
  // par commande rendrait une synchronisation de plusieurs centaines
  // d'articles inutilement lente.
  //
  // La requête est volontairement large (commande **et** identifiant
  // distant dans les listes), puis le couple exact est filtré en mémoire :
  // une seule requête vaut mieux qu'une par commande, et le lot concerné
  // reste borné par la boutique.
  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const externalIds = [...new Set(rows.map((row) => row.externalItemId))];
  const found = await db
    .select({
      orderId: schema.orderItems.orderId,
      externalItemId: schema.orderItems.externalItemId,
    })
    .from(schema.orderItems)
    .where(
      and(
        inArray(schema.orderItems.orderId, orderIds),
        inArray(schema.orderItems.externalItemId, externalIds),
      ),
    );

  const existants = new Set<string>();
  for (const row of found) existants.add(`${row.externalItemId}|${row.orderId}`);

  let inserted = 0;
  let updated = 0;

  // Un seul `INSERT` multi-lignes : le lot entier part en un aller-retour,
  // les doublons étant mis à jour sur conflit.
  await db
    .insert(schema.orderItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.orderItems.orderId, schema.orderItems.externalItemId],
      set: {
        status: sql`excluded.status`,
        trackingNumber: sql`excluded.tracking_number`,
        trackingUrl: sql`excluded.tracking_url`,
        shipmentType: sql`excluded.shipment_type`,
        deliveryOption: sql`excluded.delivery_option`,
        isFulfilledByJumia: sql`excluded.is_fulfilled_by_jumia`,
        productName: sql`excluded.product_name`,
        sellerSku: sql`excluded.seller_sku`,
        productImageUrl: sql`excluded.product_image_url`,
        countryCode: sql`excluded.country_code`,
        currency: sql`excluded.currency`,
        itemPriceMinor: sql`excluded.item_price_minor`,
        paidPriceMinor: sql`excluded.paid_price_minor`,
        shippingAmountMinor: sql`excluded.shipping_amount_minor`,
        shippedDate: sql`excluded.shipped_date`,
        raw: sql`excluded.raw`,
        syncedAt: sql`excluded.synced_at`,
      },
    });

  for (const row of rows) {
    if (existants.has(`${row.externalItemId}|${row.orderId}`)) updated += 1;
    else inserted += 1;
  }

  return { processed: rows.length, inserted, updated };
}

/** Articles d'une commande, pour le détail commande. */
export async function listOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId))
    .orderBy(sql`${schema.orderItems.productName} asc nulls last`);
}

/**
 * Articles d'un ensemble de commandes, limités aux boutiques données.
 *
 * Le périmètre est appliqué **en base** : une commande d'une autre boutique
 * n'apparaît jamais, même si elle est demandée explicitement.
 */
export async function listOrderItemsForOrders(
  shopIds: string[],
  orderIds: string[],
): Promise<OrderItemRow[]> {
  const shops = shopIds.filter((id) => id.length > 0);
  const orders = orderIds.filter((id) => id.length > 0);
  if (shops.length === 0 || orders.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(schema.orderItems)
    .where(
      and(
        inArray(schema.orderItems.shopId, shops),
        inArray(schema.orderItems.orderId, orders),
      ),
    );
}

/**
 * Statuts des articles, groupés par commande.
 *
 * Ils sont la seule information qui dise ce qu'il **reste** à faire dans une
 * commande au statut agrégé « Multiple Status » : le statut global de Jumia
 * ne dit rien, et `packedItems` compte les articles emballés — y compris
 * ceux qui ont ensuite été annulés ou livrés.
 */
export async function listItemStatusesByOrder(
  shopIds: string[],
  orderIds: string[],
): Promise<Map<string, string[]>> {
  const shops = shopIds.filter((id) => id.length > 0);
  const orders = orderIds.filter((id) => id.length > 0);
  const parCommande = new Map<string, string[]>();
  if (shops.length === 0 || orders.length === 0) return parCommande;
  const db = getDb();
  const rows = await db
    .select({ orderId: schema.orderItems.orderId, status: schema.orderItems.status })
    .from(schema.orderItems)
    .where(
      and(
        inArray(schema.orderItems.shopId, shops),
        inArray(schema.orderItems.orderId, orders),
      ),
    );
  for (const row of rows) {
    const liste = parCommande.get(row.orderId) ?? [];
    liste.push(row.status);
    parCommande.set(row.orderId, liste);
  }
  return parCommande;
}

/**
 * Statuts d'un article pour lesquels Jumia peut encore fournir une
 * étiquette d'expédition.
 *
 * Jumia refuse un article annulé, expédié ou livré : seuls l'article en
 * attente d'expédition (`PENDING`) et l'article prêt à expédier
 * (`READY_TO_SHIP`) restent imprimables.
 */
export const LABEL_ITEM_STATUSES = ["PENDING", "READY_TO_SHIP"];

/**
 * Condition SQL : un article **peut** recevoir une étiquette.
 *
 * Deux règles, vérifiées sur l'API réelle :
 *
 * 1. l'article est dans un statut livrable (`PENDING` ou `READY_TO_SHIP`) ;
 * 2. **aucune étiquette n'a encore été obtenue pour lui** : on ne redemande
 *    pas un document déjà disponible. Seules les étiquettes en erreur
 *    restent ré-essayables.
 *
 * L'ancien filtre exigeait `READY_TO_SHIP` **et** l'absence de numéro de
 * suivi : il ne pouvait jamais être satisfait (un article prêt à expédier a
 * forcément déjà un suivi, Jumia le refuse), donc aucune étiquette n'a
 * jamais pu être demandée. La règle de Jumia est plus simple : elle refuse
 * l'article **annulé, expédié ou livré**, pas l'article déjà suivi.
 */
export function labelItemConditions(shopIds: string[]) {
  return [
    inArray(schema.orderItems.shopId, shopIds),
    inArray(sql`upper(${schema.orderItems.status})`, LABEL_ITEM_STATUSES),
    sql`NOT EXISTS (
      SELECT 1 FROM shipment_labels sl
       WHERE sl.shop_id = ${schema.orderItems.shopId}
         AND sl.order_item_ids @> to_jsonb(${schema.orderItems.externalItemId})
         AND sl.status <> 'error'
    )`,
  ];
}

/**
 * Compteur d'articles **éligibles à l'impression** : articles livrables
 * (en attente d'expédition ou prêts à expédier) dont l'étiquette n'a pas
 * encore été obtenue.
 *
 * La période porte sur la **date de création de la commande**, comme le
 * reste de l'interface « Ventes et commandes ».
 */
export async function countPrintableItems(
  shopIds: string[],
  filters: { from?: Date | undefined; to?: Date | undefined } = {},
): Promise<number> {
  const shops = shopIds.filter((id) => id.length > 0);
  if (shops.length === 0) return 0;
  const db = getDb();
  const conditions = labelItemConditions(shops);
  if (filters.from) conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  if (filters.to) conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));

  const rows = await db
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(...conditions));
  return rows.length;
}
