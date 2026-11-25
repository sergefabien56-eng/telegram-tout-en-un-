import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  fetchFeedStatus,
  findPublishedProduct,
  mapPublicationState,
  PUBLICATION_STATES,
  type PublicationState,
} from "@/lib/jumia/product-feed";
import type { JumiaAccountScope } from "@/lib/jumia/request";

/**
 * Suivi des créations de produits envoyées à Jumia.
 *
 * Règle centrale : on ne dit jamais « publié » parce qu'on a cliqué sur
 * « Envoyer ». La publication n'est établie que lorsque le produit est
 * **retrouvé au catalogue** avec un contrôle qualité approuvé.
 */

export type PublicationRow = typeof schema.productPublications.$inferSelect;

/** Forme exposée à l'interface (jamais de secret). */
export type PublicPublication = {
  id: string;
  sellerSku: string;
  status: PublicationState;
  statusLabel: string;
  statusDetail: string;
  feedId: string | null;
  feedStatus: string | null;
  productSid: string | null;
  qcStatus: string | null;
  errors: string[];
  submittedAt: string;
  updatedAt: string;
};

function toPublic(row: PublicationRow): PublicPublication {
  const errors = Array.isArray(row.errors) ? (row.errors as string[]) : [];
  const etat = row.status as PublicationState;
  const meta = PUBLICATION_STATES[etat];
  return {
    id: row.id,
    sellerSku: row.sellerSku,
    status: etat,
    statusLabel: meta?.label ?? "État inconnu",
    statusDetail: meta?.detail ?? "État non documenté.",
    feedId: row.feedId,
    feedStatus: row.feedStatus,
    productSid: row.productSid,
    qcStatus: row.qcStatus,
    errors,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Publications d'une boutique, les plus récentes d'abord. */
export async function listPublications(shopId: string): Promise<PublicPublication[]> {
  const rows = await getDb()
    .select()
    .from(schema.productPublications)
    .where(eq(schema.productPublications.shopId, shopId))
    .orderBy(desc(schema.productPublications.submittedAt))
    .limit(50);
  return rows.map(toPublic);
}

/** Une publication par identifiant (limitée à la boutique). */
export async function getPublication(shopId: string, id: string): Promise<PublicationRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.productPublications)
    .where(
      and(eq(schema.productPublications.id, id), eq(schema.productPublications.shopId, shopId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Enregistre une demande d'envoi. */
export async function createPublication(input: {
  shopId: string;
  userId: string;
  sellerSku: string;
  payload: unknown;
  feedId: string;
  status?: PublicationState;
}): Promise<PublicationRow> {
  const inserted = await getDb()
    .insert(schema.productPublications)
    .values({
      shopId: input.shopId,
      userId: input.userId,
      sellerSku: input.sellerSku,
      feedId: input.feedId,
      status: input.status ?? "envoyee",
      payload: input.payload as never,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Enregistrement de la publication impossible.");
  return row;
}

/** Met à jour une publication. */
export async function updatePublication(
  id: string,
  patch: Partial<{
    status: PublicationState;
    feedStatus: string | null;
    productSid: string | null;
    qcStatus: string | null;
    errors: string[];
  }>,
): Promise<PublicationRow | null> {
  const updated = await getDb()
    .update(schema.productPublications)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.feedStatus !== undefined ? { feedStatus: patch.feedStatus } : {}),
      ...(patch.productSid !== undefined ? { productSid: patch.productSid } : {}),
      ...(patch.qcStatus !== undefined ? { qcStatus: patch.qcStatus } : {}),
      ...(patch.errors ? { errors: patch.errors } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.productPublications.id, id))
    .returning();
  return updated[0] ?? null;
}

/**
 * SKU déjà envoyé pour cette boutique ?
 *
 * Un doublon est refusé : deux créations pour le même SKU vendeur
 * produiraient deux fiches concurrentes sur Jumia.
 */
export async function findExistingSku(
  shopId: string,
  sellerSku: string,
): Promise<PublicationRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.productPublications)
    .where(
      and(
        eq(schema.productPublications.shopId, shopId),
        eq(schema.productPublications.sellerSku, sellerSku),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Le SKU existe-t-il déjà dans le catalogue local (produit synchronisé) ? */
export async function skuExistsInCatalog(shopId: string, sellerSku: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.shopId, shopId), eq(schema.products.parentSku, sellerSku)))
    .limit(1);
  if (rows[0]) return true;
  const variants = await getDb()
    .select({ id: schema.productVariants.id })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(and(eq(schema.products.shopId, shopId), eq(schema.productVariants.sellerSku, sellerSku)))
    .limit(1);
  return Boolean(variants[0]);
}

/**
 * Rafraîchit l'état d'une publication : on relit le flux chez Jumia, puis on
 * cherche le produit au catalogue.
 *
 * Une erreur de lecture n'efface pas l'état connu : on renvoie l'état
 * enregistré, avec la cause de l'échec de rafraîchissement.
 */
export async function refreshPublication(
  shopId: string,
  id: string,
  scope: JumiaAccountScope,
): Promise<{ publication: PublicPublication; refreshError: string | null }> {
  const row = await getPublication(shopId, id);
  if (!row) throw new Error("Publication introuvable.");

  const erreurs: string[] = Array.isArray(row.errors) ? (row.errors as string[]) : [];

  if (!row.feedId) {
    const publication = toPublic(row);
    return { publication, refreshError: null };
  }

  let feedStatus: string | null = row.feedStatus;
  let failed = 0;
  try {
    const feed = await fetchFeedStatus(scope, row.feedId);
    feedStatus = feed.status;
    failed = feed.failed;
    if (feed.errorMessage) erreurs.push(feed.errorMessage);
    for (const item of feed.items) {
      if (item.errorMessage) erreurs.push(item.errorMessage);
      erreurs.push(...item.messages);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture du flux impossible.";
    return { publication: toPublic(row), refreshError: message };
  }

  let published = null;
  try {
    published = await findPublishedProduct(scope, row.sellerSku);
  } catch {
    // Le produit peut ne pas être encore indexé : l'état reste « en cours ».
    published = null;
  }

  const etat = mapPublicationState({
    feedStatus,
    failed,
    errors: erreurs,
    published,
  });

  const updated = await updatePublication(id, {
    status: etat,
    feedStatus,
    productSid: published?.id ?? row.productSid,
    qcStatus: published?.qcStatus ?? row.qcStatus,
    errors: erreurs.slice(0, 20),
  });

  return { publication: toPublic(updated ?? row), refreshError: null };
}
