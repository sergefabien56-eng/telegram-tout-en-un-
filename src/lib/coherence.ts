import { and, count, countDistinct, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { fetchAllOrderPages } from "@/lib/jumia/orders";
import { fetchAllProductPages } from "@/lib/jumia/catalog";
import { fetchPayoutStatements } from "@/lib/jumia/payments";
import { orderShopIds, productShopId, statementShopSid } from "@/lib/shop-guard";

/**
 * PREUVE DE COHÉRENCE : on compare ce que le Seller Center (Jumia) renvoie
 * avec ce que l'application a enregistré pour une boutique.
 *
 * Objectif : détecter une boutique qui « apparaît » comme connectée alors
 * que ses données sont incomplètes, anciennes, mélangées ou absentes.
 *
 * Principes :
 * - toute comparaison se fait sur la **même fenêtre** et le **même périmètre**
 *   (compte vendeur lié + boutique distante) ;
 * - un écart n'est signalé que si l'on peut le prouver (ex. : commandes
 *   présentes chez Jumia mais absentes chez nous) ;
 * - le résultat indique toujours la provenance de chaque chiffre.
 */

export type CoherenceStatus = "coherent" | "ecart" | "indisponible";

export type CoherenceCheck = {
  shopId: string;
  shopName: string;
  accountId: string | null;
  remoteShopId: string | null;
  /** Fenêtre de comparaison des commandes. */
  window: { days: number; from: string; to: string };
  local: {
    products: number;
    variants: number;
    orders: number;
    statements: number;
    /** Commandes enregistrées dans la fenêtre de comparaison. */
    ordersInWindow: number;
    lastSyncAt: Date | null;
  };
  remote: {
    products: number | null;
    orders: number | null;
    statements: number | null;
    /** `true` si la lecture distante a été tronquée (quota) : borne basse. */
    truncated: boolean;
    readAt: Date;
  } | null;
  /** Écarts mesurés (local − distant). */
  deltas: { products: number | null; orders: number | null; statements: number | null };
  status: CoherenceStatus;
  /** Anomalies prouvées, avec leur cause et leur conséquence. */
  anomalies: CoherenceAnomaly[];
  notes: string[];
};

export type AnomalySeverity = "critique" | "avertissement" | "information";

export type CoherenceAnomaly = {
  code:
    | "donnees_manquantes"
    | "donnees_en_trop"
    | "donnees_melangees"
    | "donnees_sans_provenance"
    | "doublons"
    | "donnees_perimeses"
    | "synchronisation_echouee"
    | "compte_manquant"
    | "lecture_impossible";
  severity: AnomalySeverity;
  title: string;
  /** Ce qui a été mesuré (chiffres). */
  evidence: string;
  /** Origine probable et conséquence pour le vendeur. */
  cause: string;
  /** Action corrective recommandée. */
  recommendation: string;
};

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Contrôle de cohérence d'une boutique.
 *
 * @param days Fenêtre des commandes comparée (90 jours maximum chez Jumia).
 */
export async function checkShopCoherence(params: {
  shopId: string;
  days?: number;
}): Promise<CoherenceCheck> {
  const days = Math.min(Math.max(Math.round(params.days ?? 90), 1), 90);
  const db = getDb();

  const shopRows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      remoteShopId: schema.shops.remoteShopId,
      jumiaAccountId: schema.shops.jumiaAccountId,
      lastSyncAt: schema.shops.lastSyncAt,
      lastSyncStatus: schema.shops.lastSyncStatus,
    })
    .from(schema.shops)
    .where(eq(schema.shops.id, params.shopId))
    .limit(1);
  const shop = shopRows[0];

  const to = new Date();
  // Fenêtre alignée sur les JOURS (minuit UTC) : c'est exactement ce que
  // l'API Jumia utilise (`createdAfter`/`createdBefore` sont des dates). Une
  // fenêtre rolling produirait de faux écarts.
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - days * DAY_MS,
  );
  const window = { days, from: isoDay(from), to: isoDay(to) };

  if (!shop) {
    return {
      shopId: params.shopId,
      shopName: "Boutique introuvable",
      accountId: null,
      remoteShopId: null,
      window,
      local: { products: 0, variants: 0, orders: 0, statements: 0, ordersInWindow: 0, lastSyncAt: null },
      remote: null,
      deltas: { products: null, orders: null, statements: null },
      status: "indisponible",
      anomalies: [],
      notes: ["Boutique introuvable."],
    };
  }

  // --- Volumétrie locale ---
  const [products, variants, orders, statements, ordersInWindow] = await Promise.all([
    db
      .select({ total: count() })
      .from(schema.products)
      .where(eq(schema.products.shopId, shop.id)),
    db
      .select({ total: count(schema.productVariants.id) })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
      .where(eq(schema.products.shopId, shop.id)),
    db.select({ total: count() }).from(schema.orders).where(eq(schema.orders.shopId, shop.id)),
    db
      .select({ total: count() })
      .from(schema.payoutStatements)
      .where(eq(schema.payoutStatements.shopId, shop.id)),
    db
      .select({ total: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shop.id),
          gte(schema.orders.remoteCreatedAt, from),
          lte(schema.orders.remoteCreatedAt, to),
        ),
      ),
  ]);

  const local = {
    products: products[0]?.total ?? 0,
    variants: variants[0]?.total ?? 0,
    orders: orders[0]?.total ?? 0,
    statements: statements[0]?.total ?? 0,
    ordersInWindow: ordersInWindow[0]?.total ?? 0,
    lastSyncAt: shop.lastSyncAt,
  };

  const anomalies: CoherenceAnomaly[] = [];
  const notes: string[] = [];

  // --- Contrôles d'intégrité locale (sans réseau) ---
  const [mixedOrders, orphanOrders, mixedProducts, orphanProducts, mixedStatements] =
    await Promise.all([
      countMixedOrders(shop.id, shop.remoteShopId),
      countOrdersWithoutRaw(shop.id),
      countMixedProducts(shop.id, shop.remoteShopId),
      countProductsWithoutRaw(shop.id),
      countMixedStatements(shop.id, shop.remoteShopId),
    ]);

  if (mixedOrders > 0) {
    anomalies.push({
      code: "donnees_melangees",
      severity: "critique",
      title: `${mixedOrders} commande(s) appartiennent à une autre boutique`,
      evidence: `${mixedOrders} commande(s) enregistrée(s) sous cette boutique portent un autre identifiant de boutique Jumia.`,
      cause: "Données récupérées avec un mauvais périmètre de compte vendeur.",
      recommendation: "Resynchroniser la boutique : les données étrangères sont écartées automatiquement.",
    });
  }
  if (orphanOrders > 0) {
    anomalies.push({
      code: "donnees_sans_provenance",
      severity: "critique",
      title: `${orphanOrders} commande(s) sans provenance vérifiable`,
      evidence: `${orphanOrders} commande(s) n'ont pas de charge utile brute Jumia.`,
      cause: "Enregistrement hors synchronisation (import ou écriture locale).",
      recommendation: "Resynchroniser la boutique pour reconstruire la provenance.",
    });
  }
  if (mixedProducts > 0) {
    anomalies.push({
      code: "donnees_melangees",
      severity: "critique",
      title: `${mixedProducts} produit(s) appartiennent à une autre boutique`,
      evidence: `${mixedProducts} produit(s) portent un identifiant « shop.id » Jumia différent.`,
      cause: "Catalogue récupéré avec un mauvais périmètre de compte vendeur.",
      recommendation: "Resynchroniser le catalogue de la boutique.",
    });
  }
  if (orphanProducts > 0) {
    anomalies.push({
      code: "donnees_sans_provenance",
      severity: "critique",
      title: `${orphanProducts} produit(s) sans provenance vérifiable`,
      evidence: `${orphanProducts} produit(s) n'ont pas de charge utile brute Jumia.`,
      cause: "Enregistrement hors synchronisation.",
      recommendation: "Resynchroniser le catalogue de la boutique.",
    });
  }
  if (mixedStatements > 0) {
    anomalies.push({
      code: "donnees_melangees",
      severity: "critique",
      title: `${mixedStatements} relevé(s) appartiennent à une autre boutique`,
      evidence: `${mixedStatements} relevé(s) portent un identifiant « shopSid » Jumia différent.`,
      cause: "Relevés récupérés avec un mauvais périmètre de compte vendeur.",
      recommendation: "Resynchroniser les relevés de la boutique.",
    });
  }

  const duplicateOrders = await countDuplicateOrders(shop.id);
  if (duplicateOrders > 0) {
    anomalies.push({
      code: "doublons",
      severity: "avertissement",
      title: `${duplicateOrders} identifiant(s) de commande en double`,
      evidence: `${duplicateOrders} numéro(s) de commande apparaissent plusieurs fois pour cette boutique.`,
      cause: "Contrainte d'unicité (boutique, numéro externe) non appliquée.",
      recommendation: "Resynchroniser : l'upsert (boutique, numéro) supprime les doublons.",
    });
  }

  if (shop.lastSyncStatus && shop.lastSyncStatus !== "ok") {
    anomalies.push({
      code: "synchronisation_echouee",
      severity: "critique",
      title: `Dernière synchronisation en échec (${shop.lastSyncStatus})`,
      evidence: `Statut de la dernière synchronisation : ${shop.lastSyncStatus}.`,
      cause: "Échec du dernier appel à Jumia (jeton, quota ou réseau).",
      recommendation: "Relancer la synchronisation depuis le diagnostic.",
    });
  }

  if (shop.lastSyncAt && Date.now() - shop.lastSyncAt.getTime() > 7 * DAY_MS) {
    anomalies.push({
      code: "donnees_perimeses",
      severity: "avertissement",
      title: "Données anciennes",
      evidence: `Dernière synchronisation il y a ${Math.round((Date.now() - shop.lastSyncAt.getTime()) / DAY_MS)} jours.`,
      cause: "Aucune synchronisation récente.",
      recommendation: "Resynchroniser la boutique.",
    });
  }

  // --- Lecture distante (preuve) ---
  const accountId = await accountIdForShop(shop.id);
  if (!shop.remoteShopId || !accountId) {
    anomalies.push({
      code: "compte_manquant",
      severity: "critique",
      title: "Boutique non comparable avec Jumia",
      evidence: !shop.remoteShopId
        ? "Aucun identifiant de boutique distante."
        : "Aucun compte vendeur Jumia lié.",
      cause: "Rattachement incomplet.",
      recommendation: "Lier la boutique à un compte vendeur depuis Boutiques → Comptes Jumia.",
    });
    return {
      shopId: shop.id,
      shopName: shop.name,
      accountId,
      remoteShopId: shop.remoteShopId,
      window,
      local,
      remote: null,
      deltas: { products: null, orders: null, statements: null },
      status: "indisponible",
      anomalies,
      notes,
    };
  }

  let remote: CoherenceCheck["remote"] = null;
  let deltas: CoherenceCheck["deltas"] = { products: null, orders: null, statements: null };
  let status: CoherenceStatus = "indisponible";

  try {
    const [catalog, orderPages, statementsPage] = await Promise.all([
      fetchAllProductPages({ accountId, shopId: shop.remoteShopId, size: 100, maxPages: 5 }),
      fetchAllOrderPages({
        accountId,
        shopId: shop.remoteShopId,
        createdAfter: window.from,
        createdBefore: window.to,
        size: 200,
        maxPages: 5,
      }),
      fetchPayoutStatements({ accountId, currency: "LOCAL", size: 100, page: 1 }),
    ]);

    // Les relevés sont lus au niveau du compte : on ne garde que ceux de la
    // boutique comparée (identifiant `shopSid`).
    const statementsForShop = statementsPage.statements.filter(
      (statement) =>
        statementShopSid(statement as Record<string, unknown>) === shop.remoteShopId,
    );

    remote = {
      products: catalog.products.length,
      orders: orderPages.orders.length,
      statements: statementsForShop.length,
      truncated: catalog.truncated || orderPages.truncated,
      readAt: new Date(),
    };

    deltas = {
      products: local.products - (remote.products ?? 0),
      orders: local.ordersInWindow - (remote.orders ?? 0),
      statements: local.statements - (remote.statements ?? 0),
    };

    status = "coherent";

    if (remote.truncated) {
      notes.push(
        "Lecture distante tronquée (quota Jumia) : le nombre distant est une borne basse, seul un manque de données est concluant.",
      );
    }

    // Manques prouvés : Jumia a plus que nous sur la même fenêtre.
    const remoteProducts = remote.products ?? 0;
    const remoteOrders = remote.orders ?? 0;
    const remoteStatementCount = remote.statements ?? 0;
    if (remote.products !== null && local.products < remoteProducts) {
      anomalies.push({
        code: "donnees_manquantes",
        severity: "critique",
        title: `Catalogue incomplet : ${remoteProducts - local.products} produit(s) manquant(s)`,
        evidence: `Jumia renvoie ${remoteProducts} produit(s), l'application en a ${local.products}.`,
        cause: "Synchronisation partielle ou interrompue.",
        recommendation: "Resynchroniser le catalogue de la boutique.",
      });
      status = "ecart";
    }
    if (remote.orders !== null && local.ordersInWindow < remoteOrders) {
      anomalies.push({
        code: "donnees_manquantes",
        severity: "critique",
        title: `${remoteOrders - local.ordersInWindow} commande(s) manquante(s) sur ${window.days} jours`,
        evidence: `Jumia renvoie ${remoteOrders} commande(s) sur la fenêtre, l'application en a ${local.ordersInWindow}.`,
        cause: "Synchronisation partielle, interrompue ou jamais relancée.",
        recommendation: "Resynchroniser les commandes de la boutique.",
      });
      status = "ecart";
    }
    if (remote.statements !== null && local.statements < remoteStatementCount) {
      anomalies.push({
        code: "donnees_manquantes",
        severity: "avertissement",
        title: `${remoteStatementCount - local.statements} relevé(s) de versement manquant(s)`,
        evidence: `Jumia renvoie ${remoteStatementCount} relevé(s) pour cette boutique, l'application en a ${local.statements}.`,
        cause: "Relevés non synchronisés (ou hors fenêtre de l'API).",
        recommendation: "Resynchroniser les relevés de la boutique.",
      });
      status = "ecart";
    }

    // Excédent : des données que Jumia ne renvoie plus (obsolètes, doublons).
    if (remote.orders !== null && local.ordersInWindow > remoteOrders) {
      anomalies.push({
        code: "donnees_en_trop",
        severity: "information",
        title: `${local.ordersInWindow - remoteOrders} commande(s) enregistrées hors de la fenêtre Jumia`,
        evidence: `L'application en a ${local.ordersInWindow} sur la fenêtre, Jumia n'en renvoie que ${remoteOrders}.`,
        cause: "Commandes plus anciennes que la fenêtre lue, ou pagination Jumia tronquée.",
        recommendation: "Vérifier la pagination ; aucune suppression automatique n'est faite.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    anomalies.push({
      code: "lecture_impossible",
      severity: "critique",
      title: "Lecture Jumia impossible",
      evidence: message,
      cause: "Compte vendeur refusé (jeton expiré), quota atteint ou réseau indisponible.",
      recommendation: "Tester le compte vendeur puis relancer la synchronisation.",
    });
    notes.push("Comparaison distante impossible : seuls les contrôles locaux ont pu être faits.");
  }

  if (anomalies.some((anomaly) => anomaly.severity === "critique")) status = "ecart";

  return {
    shopId: shop.id,
    shopName: shop.name,
    accountId,
    remoteShopId: shop.remoteShopId,
    window,
    local,
    remote,
    deltas,
    status,
    anomalies,
    notes,
  };
}

/** Commandes de la boutique dont la charge utile porte une autre boutique. */
async function countMixedOrders(shopId: string, remoteShopId: string | null): Promise<number> {
  if (!remoteShopId) return 0;
  const db = getDb();
  const rows = await db
    .select({ raw: schema.orders.raw })
    .from(schema.orders)
    .where(eq(schema.orders.shopId, shopId));
  return rows.filter((row) => {
    const ids = orderShopIds(row.raw as Record<string, unknown>);
    return ids !== null && !ids.includes(remoteShopId);
  }).length;
}

/** Commandes sans charge utile brute : provenance non vérifiable. */
async function countOrdersWithoutRaw(shopId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ total: count() })
    .from(schema.orders)
    .where(and(eq(schema.orders.shopId, shopId), isNull(schema.orders.raw)));
  return rows[0]?.total ?? 0;
}

/** Produits de la boutique dont la charge utile porte une autre boutique. */
async function countMixedProducts(shopId: string, remoteShopId: string | null): Promise<number> {
  if (!remoteShopId) return 0;
  const db = getDb();
  const rows = await db
    .select({ raw: schema.products.raw })
    .from(schema.products)
    .where(eq(schema.products.shopId, shopId));
  return rows.filter((row) => {
    const id = productShopId(row.raw as Record<string, unknown>);
    return id !== null && id !== remoteShopId;
  }).length;
}

/** Produits sans charge utile brute : provenance non vérifiable. */
async function countProductsWithoutRaw(shopId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ total: count() })
    .from(schema.products)
    .where(and(eq(schema.products.shopId, shopId), isNull(schema.products.raw)));
  return rows[0]?.total ?? 0;
}

/** Relevés de la boutique dont le `shopSid` porte une autre boutique. */
async function countMixedStatements(shopId: string, remoteShopId: string | null): Promise<number> {
  if (!remoteShopId) return 0;
  const db = getDb();
  const rows = await db
    .select({ remoteShopSid: schema.payoutStatements.remoteShopSid })
    .from(schema.payoutStatements)
    .where(eq(schema.payoutStatements.shopId, shopId));
  return rows.filter(
    (row) => row.remoteShopSid !== null && row.remoteShopSid !== remoteShopId,
  ).length;
}

/** Numéros de commande répétés pour une même boutique. */
async function countDuplicateOrders(shopId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      total: count(),
      distinctTotal: countDistinct(schema.orders.externalOrderId),
    })
    .from(schema.orders)
    .where(eq(schema.orders.shopId, shopId));
  const total = rows[0]?.total ?? 0;
  const distinct = rows[0]?.distinctTotal ?? 0;
  return Math.max(0, total - distinct);
}

/** Volumétrie globale par boutique (utilisée par le diagnostic). */
export async function shopDataVolumes(shopIds: string[]) {
  if (shopIds.length === 0) return new Map<string, number>();
  const db = getDb();
  const rows = await db
    .select({ shopId: schema.orders.shopId, total: count() })
    .from(schema.orders)
    .where(inArray(schema.orders.shopId, shopIds))
    .groupBy(schema.orders.shopId);
  const map = new Map<string, number>();
  for (const id of shopIds) map.set(id, 0);
  for (const row of rows) map.set(row.shopId, row.total);
  return map;
}
