import { and, desc, eq, getTableColumns, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sha256Hex, sha256HexOfBytes } from "@/lib/crypto";

export type ShipmentLabelInsert = typeof schema.shipmentLabels.$inferInsert;
export type ShipmentLabelRow = typeof schema.shipmentLabels.$inferSelect;

/**
 * États **finaux** d'une étiquette. Ils ne sont jamais fusionnés :
 *
 * - `available` : le PDF est là, décodé, vérifié et enregistré ;
 * - `pending`  : la demande est partie, le PDF n'est pas encore arrivé ;
 * - `error`     : Jumia a refusé — le motif exact est conservé.
 *
 * Une réponse **partielle** (certains colis produits, d'autres refusés) reste
 * visible comme telle : les deux branches existent simultanément en base.
 */
export const LABEL_STATUS_AVAILABLE = "available";
export const LABEL_STATUS_PENDING = "pending";
export const LABEL_STATUS_ERROR = "error";

export type LabelStatus =
  | typeof LABEL_STATUS_AVAILABLE
  | typeof LABEL_STATUS_PENDING
  | typeof LABEL_STATUS_ERROR;

/** Libellés affichés. */
export const LABEL_STATUS_LABELS: Record<LabelStatus, string> = {
  available: "Disponible",
  pending: "Pas encore disponible",
  error: "Erreur Jumia",
};

/**
 * Clé d'idempotence d'un **colis** (un PDF).
 *
 * Jumia ne renvoie pas d'identifiant de colis : la clé est donc construite
 * à partir de la boutique, de la commande et de la liste **triée** des
 * articles couverts. Relancer l'impression pour la même commande ne crée
 * donc jamais deux étiquettes pour le même colis.
 */
export function packageKey(
  shopId: string,
  orderId: string,
  orderItemIds: readonly string[],
): string {
  const items = [...orderItemIds].sort();
  return sha256Hex(`pkg|${shopId}|${orderId}|${items.join(",")}`);
}

/**
 * Clé d'idempotence d'un **article refusé**.
 *
 * Le préfixe `err` l'empêche de jamais entrer en collision avec la clé d'un
 * colis : un article qui échoue puis réussit conserve deux états distincts
 * et cohérents.
 */
export function itemErrorKey(shopId: string, orderId: string, orderItemId: string): string {
  return sha256Hex(`err|${shopId}|${orderId}|${orderItemId}`);
}

/** Format d'identifiant local (UUID) accepté par PostgreSQL. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ne conserve que les identifiants **réellement exploitables**.
 *
 * Une valeur venue d'une URL ou d'un paramètre ne doit jamais provoquer une
 * erreur SQL : elle est écartée, et la requête porte sur le reste.
 */
function usableIds(ids: string[]): string[] {
  return ids.filter((id) => UUID_RE.test(id.trim()));
}

/**
 * Décode un PDF d'étiquette renvoyé en base64 par Jumia.
 *
 * Le document n'est accepté que si :
 * - la chaîne est bien du base64 ;
 * - les octets décodés commencent par la signature `%PDF-` ;
 * - son empreinte SHA-256 est calculée.
 *
 * Renvoie `null` si l'une de ces conditions échoue : une étiquette non
 * conforme n'est **jamais** enregistrée comme disponible.
 */
export function decodeLabelPdf(
  base64: string,
): { pdf: Buffer; sha256: string; size: number } | null {
  if (typeof base64 !== "string") return null;
  const compact = base64.replace(/\s+/g, "");
  if (compact.length === 0) return null;
  // Base64 strict : alphabet + padding. Un caractère hors alphabet signifie
  // que la charge utile n'est pas un document.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  if (compact.length % 4 !== 0) return null;

  const pdf = Buffer.from(compact, "base64");
  if (pdf.length === 0) return null;
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;

  return { pdf, sha256: sha256HexOfBytes(pdf), size: pdf.length };
}

/**
 * Enregistre (ou met à jour) une étiquette disponible.
 *
 * La clé de colis rend l'opération idempotente : une seconde impression
 * du même colis écrase la ligne au lieu d'en créer une seconde.
 *
 * Les états non résolus qui portaient sur ces articles sont effacés : un
 * article ne peut pas être à la fois « disponible » et « en attente ».
 */
export async function upsertAvailableLabel(params: {
  shopId: string;
  orderId: string;
  orderItemIds: string[];
  countryCode: string | null;
  trackingNumber: string | null;
  pdf: Buffer;
  pdfSha256: string;
  pdfSize: number;
}): Promise<void> {
  const db = getDb();
  const items = [...params.orderItemIds].sort();
  const key = packageKey(params.shopId, params.orderId, items);

  await db
    .insert(schema.shipmentLabels)
    .values({
      shopId: params.shopId,
      orderId: params.orderId,
      packageKey: key,
      orderItemIds: items,
      trackingNumber: params.trackingNumber,
      countryCode: params.countryCode,
      status: LABEL_STATUS_AVAILABLE,
      errorCode: null,
      errorMessage: null,
      pdf: params.pdf,
      pdfSha256: params.pdfSha256,
      pdfSize: params.pdfSize,
      itemCount: items.length,
      requestedAt: new Date(),
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.shipmentLabels.shopId, schema.shipmentLabels.packageKey],
      set: {
        orderItemIds: items,
        trackingNumber: params.trackingNumber,
        countryCode: params.countryCode,
        status: LABEL_STATUS_AVAILABLE,
        errorCode: null,
        errorMessage: null,
        pdf: params.pdf,
        pdfSha256: params.pdfSha256,
        pdfSize: params.pdfSize,
        itemCount: items.length,
        availableAt: new Date(),
        updatedAt: new Date(),
      },
    });

  await clearSupersededLabels({
    shopId: params.shopId,
    orderId: params.orderId,
    itemIds: items,
    statuses: [LABEL_STATUS_PENDING, LABEL_STATUS_ERROR],
  });
}

/**
 * Enregistre (ou met à jour) une étiquette **refusée** par Jumia.
 *
 * Le motif est conservé tel quel : `code` et `message` de la réponse
 * officielle. Rien n'est réécrit, rien n'est deviné.
 */
export async function upsertErrorLabel(params: {
  shopId: string;
  orderId: string;
  orderItemId: string;
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<void> {
  const db = getDb();
  const key = itemErrorKey(params.shopId, params.orderId, params.orderItemId);

  await db
    .insert(schema.shipmentLabels)
    .values({
      shopId: params.shopId,
      orderId: params.orderId,
      packageKey: key,
      orderItemIds: [params.orderItemId],
      status: LABEL_STATUS_ERROR,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      itemCount: 1,
      requestedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.shipmentLabels.shopId, schema.shipmentLabels.packageKey],
      set: {
        status: LABEL_STATUS_ERROR,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        updatedAt: new Date(),
      },
    });

  // L'article a connu son sort : l'éventuel « pas encore disponible » qui le
  // concernait n'est plus d'actualité.
  await clearSupersededLabels({
    shopId: params.shopId,
    orderId: params.orderId,
    itemIds: [params.orderItemId],
    statuses: [LABEL_STATUS_PENDING],
  });
}

/**
 * Enregistre une étiquette **en attente** : la demande est partie, le PDF
 * n'est pas encore arrivé (échec réseau, ou Jumia indisponible).
 */
export async function upsertPendingLabel(params: {
  shopId: string;
  orderId: string;
  orderItemIds: string[];
  errorMessage: string | null;
}): Promise<void> {
  const db = getDb();
  const items = [...params.orderItemIds].sort();
  const key = packageKey(params.shopId, params.orderId, items);

  await db
    .insert(schema.shipmentLabels)
    .values({
      shopId: params.shopId,
      orderId: params.orderId,
      packageKey: key,
      orderItemIds: items,
      status: LABEL_STATUS_PENDING,
      errorMessage: params.errorMessage,
      itemCount: items.length,
      requestedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.shipmentLabels.shopId, schema.shipmentLabels.packageKey],
      set: {
        status: LABEL_STATUS_PENDING,
        errorMessage: params.errorMessage,
        updatedAt: new Date(),
      },
    });

  // L'issue de ces articles n'est plus connue : un ancien refus ne doit
  // plus être présenté comme l'état actuel.
  await clearSupersededLabels({
    shopId: params.shopId,
    orderId: params.orderId,
    itemIds: items,
    statuses: [LABEL_STATUS_ERROR],
  });
}

/**
 * Supprime les états **non résolus** qui portent sur des articles dont on
 * vient de connaître le sort.
 *
 * Sans cela, un article qui échoue puis réussit resterait affiché à la fois
 * en erreur et disponible : l'interface mentirait sur l'état réel.
 *
 * `statuses` précise quels états sont effacés : chaque transition connue
 * remplace un état précédent, jamais l'inverse.
 */
export async function clearSupersededLabels(params: {
  shopId: string;
  orderId: string;
  itemIds: string[];
  /** États à effacer (par défaut : « en attente » et « erreur »). */
  statuses?: LabelStatus[];
}): Promise<void> {
  if (params.itemIds.length === 0) return;
  const statuses = params.statuses ?? [LABEL_STATUS_PENDING, LABEL_STATUS_ERROR];
  if (statuses.length === 0) return;
  const db = getDb();
  for (const itemId of params.itemIds) {
    await db
      .delete(schema.shipmentLabels)
      .where(
        and(
          eq(schema.shipmentLabels.shopId, params.shopId),
          eq(schema.shipmentLabels.orderId, params.orderId),
          inArray(schema.shipmentLabels.status, statuses),
          sql`${schema.shipmentLabels.orderItemIds} @> ${JSON.stringify([itemId])}::jsonb`,
        ),
      );
  }
}

/** Étiquettes d'un ensemble de commandes (périmètre boutique appliqué en base). */
export type ShipmentLabelListRow = ShipmentLabelRow & {
  orderNumber: string | null;
  externalOrderId: string;
  shopName: string;
  remoteCreatedAt: Date | null;
};

export async function listShipmentLabels(
  shopIds: string[],
  filters: {
    status?: LabelStatus[];
    orderIds?: string[];
    /** Période de création des commandes concerned. */
    from?: Date | undefined;
    to?: Date | undefined;
    limit?: number;
  } = {},
): Promise<ShipmentLabelListRow[]> {
  const shops = usableIds(shopIds);
  if (shops.length === 0) return [];
  const db = getDb();

  const conditions = [inArray(schema.shipmentLabels.shopId, shops)];
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(schema.shipmentLabels.status, filters.status));
  }
  if (filters.orderIds && filters.orderIds.length > 0) {
    conditions.push(inArray(schema.shipmentLabels.orderId, filters.orderIds));
  }
  if (filters.from) {
    conditions.push(gte(schema.orders.remoteCreatedAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(schema.orders.remoteCreatedAt, filters.to));
  }

  return db
    .select({
      ...getTableColumns(schema.shipmentLabels),
      orderNumber: schema.orders.orderNumber,
      externalOrderId: schema.orders.externalOrderId,
      shopName: schema.shops.name,
      remoteCreatedAt: schema.orders.remoteCreatedAt,
    })
    .from(schema.shipmentLabels)
    .innerJoin(schema.orders, eq(schema.shipmentLabels.orderId, schema.orders.id))
    .innerJoin(schema.shops, eq(schema.shipmentLabels.shopId, schema.shops.id))
    .where(and(...conditions))
    .orderBy(desc(schema.shipmentLabels.availableAt), desc(schema.shipmentLabels.requestedAt))
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
}

/**
 * Une étiquette, pour le téléchargement du PDF.
 *
 * Le périmètre est vérifié **côté serveur** : une étiquette d'une boutique
 * non autorisée n'est jamais renvoyée, même si son identifiant est deviné.
 */
export async function getShipmentLabel(
  labelId: string,
  allowedShopIds: string[],
): Promise<ShipmentLabelListRow | null> {
  if (!UUID_RE.test(labelId.trim())) return null;
  const shops = usableIds(allowedShopIds);
  if (shops.length === 0) return null;
  const db = getDb();
  const rows = await db
    .select({
      label: schema.shipmentLabels,
      orderNumber: schema.orders.orderNumber,
      externalOrderId: schema.orders.externalOrderId,
      shopName: schema.shops.name,
      remoteCreatedAt: schema.orders.remoteCreatedAt,
    })
    .from(schema.shipmentLabels)
    .innerJoin(schema.orders, eq(schema.shipmentLabels.orderId, schema.orders.id))
    .innerJoin(schema.shops, eq(schema.shipmentLabels.shopId, schema.shops.id))
    .where(and(eq(schema.shipmentLabels.id, labelId), inArray(schema.shipmentLabels.shopId, shops)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.label,
    orderNumber: row.orderNumber,
    externalOrderId: row.externalOrderId,
    shopName: row.shopName,
    remoteCreatedAt: row.remoteCreatedAt,
  };
}

/** Compteurs d'étiquettes par état. */
export async function countShipmentLabelsByStatus(
  shopIds: string[],
): Promise<Record<LabelStatus, number>> {
  const shops = usableIds(shopIds);
  const counts: Record<LabelStatus, number> = {
    available: 0,
    pending: 0,
    error: 0,
  };
  if (shops.length === 0) return counts;
  const db = getDb();
  const rows = await db
    .select({ status: schema.shipmentLabels.status })
    .from(schema.shipmentLabels)
    .where(inArray(schema.shipmentLabels.shopId, shops));
  for (const row of rows) {
    if (row.status === LABEL_STATUS_AVAILABLE) counts.available += 1;
    else if (row.status === LABEL_STATUS_PENDING) counts.pending += 1;
    else if (row.status === LABEL_STATUS_ERROR) counts.error += 1;
  }
  return counts;
}
