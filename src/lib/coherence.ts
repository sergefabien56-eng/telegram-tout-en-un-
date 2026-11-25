import { and, count, countDistinct, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { accountIdForShop } from "@/lib/jumia/accounts";
import { fetchAllOrderPages } from "@/lib/jumia/orders";
import { fetchAllProductPages } from "@/lib/jumia/catalog";
import { fetchAllPayoutStatements } from "@/lib/jumia/payments";
import { normalizePayoutStatement } from "@/lib/payments";
import { normalizeOrder } from "@/lib/orders";
import { orderShopIds, productShopId, statementShopSid } from "@/lib/shop-guard";
import { formatMoney } from "@/lib/money";

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
  /**
   * PREUVE FINANCIÈRE : comparaison au centime des relevés de versement.
   *
   * `compared` = relevés présents des deux côtés ; `divergent` = relevés dont
   * au moins un montant diffère. Les totaux sont exprimés en unités mineures
   * de la devise locale.
   */
  financials: FinancialProof | null;
  /**
   * PREUVE DES COMMANDES : comparaison au centime, commande par commande.
   */
  ordersProof: OrderProof | null;
  status: CoherenceStatus;
  /** Anomalies prouvées, avec leur cause et leur conséquence. */
  anomalies: CoherenceAnomaly[];
  notes: string[];
};

export type AnomalySeverity = "critique" | "avertissement" | "information";

/**
 * Comparaison financière relevé par relevé entre Jumia et la copie locale.
 */
export type FinancialProof = {
  /** Relevés comparés (présents des deux côtés). */
  compared: number;
  /** Relevés renvoyés par Jumia mais absents de la base. */
  missing: number;
  /** Relevés en base mais absents de la lecture Jumia. */
  extra: number;
  /** Relevés dont au moins un montant diverge. */
  divergent: number;
  /** Totaux locaux des relevés comparés (unités mineures). */
  local: { revenue: number; fees: number; refunds: number; net: number };
  /** Totaux Jumia des mêmes relevés (unités mineures). */
  remote: { revenue: number; fees: number; refunds: number; net: number };
  /** Devise des montants comparés. */
  currency: string;
  /** Détail des divergences (au plus 20, pour rester lisible). */
  details: { statementNumber: string; field: string; local: number; remote: number }[];
  /** Lecture distante tronquée : les totaux sont alors des bornes basses. */
  truncated: boolean;
};

/**
 * Comparaison des commandes entre Jumia et la copie locale.
 *
 * Les **montants** doivent être identiques au centime : c'est la preuve que
 * les chiffres affichés au vendeur sont ceux de sa source. Le **statut**,
 * lui, évolue normalement (une commande expédiée devient livrée) : un écart
 * de statut signale une copie locale **périmée**, pas une erreur de montant.
 */
export type OrderProof = {
  /** Commandes comparées (présentes des deux côtés). */
  compared: number;
  /** Commandes chez Jumia mais absentes de la base. */
  missing: number;
  /** Commandes en base, hors de la fenêtre lue chez Jumia. */
  extra: number;
  /** Commandes dont au moins un montant diverge. */
  divergent: number;
  /** Commandes dont le statut chez Jumia a changé depuis la dernière copie. */
  outdated: number;
  /** Totaux locaux des commandes comparées (unités mineures). */
  local: { amountMinor: number; usdMinor: number };
  /** Totaux Jumia des mêmes commandes (unités mineures). */
  remote: { amountMinor: number; usdMinor: number };
  /** Devise des montants locaux comparés. */
  currency: string;
  /** Détail des divergences de montant (au plus 20). */
  details: { externalOrderId: string; field: string; local: number; remote: number }[];
  /** Lecture distante tronquée : les totaux sont alors des bornes basses. */
  truncated: boolean;
};

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
    | "lecture_impossible"
    | "montant_divergent"
    | "releve_manquant"
    | "releve_en_trop"
    | "releve_non_attribuable"
    | "releve_illisible"
    | "commande_manquante"
    | "commande_non_synchronisee"
    | "commande_en_trop";
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
      financials: null,
      ordersProof: null,
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
      financials: null,
      ordersProof: null,
      status: "indisponible",
      anomalies,
      notes,
    };
  }

  let remote: CoherenceCheck["remote"] = null;
  let deltas: CoherenceCheck["deltas"] = { products: null, orders: null, statements: null };
  let financials: CoherenceCheck["financials"] = null;
  let ordersProof: CoherenceCheck["ordersProof"] = null;
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
      fetchAllPayoutStatements({
        accountId,
        currency: "LOCAL",
        size: 100,
        maxPages: 5,
      }),
    ]);

    // Les relevés sont lus au niveau du compte : on ne garde que ceux de la
    // boutique comparée (identifiant `shopSid`).
    const statementsForShop = statementsPage.statements.filter(
      (statement) =>
        statementShopSid(statement as Record<string, unknown>) === shop.remoteShopId,
    );
    // Relevés sans `shopSid` : non attribuables à une boutique, donc non
    // comparables — ils sont signalés, jamais silentés.
    const unattributableStatements = statementsPage.statements.filter(
      (statement) => statementShopSid(statement as Record<string, unknown>) === null,
    );

    remote = {
      products: catalog.products.length,
      orders: orderPages.orders.length,
      statements: statementsForShop.length,
      truncated: catalog.truncated || orderPages.truncated,
      readAt: new Date(),
    };

    // --- PREUVE FINANCIÈRE (au centime) ---
    const financialProof = await proveFinancials({
      shopId: shop.id,
      remoteStatements: statementsForShop,
      truncated: statementsPage.truncated,
    });
    financials = financialProof.proof;

    if (unattributableStatements.length > 0) {
      anomalies.push({
        code: "releve_non_attribuable",
        severity: "avertissement",
        title: `${unattributableStatements.length} relevé(s) sans identifiant de boutique`,
        evidence: `${unattributableStatements.length} relevé(s) renvoyé(s) par Jumia ne portent pas de « shopSid » : ils ne peuvent être attribués à aucune boutique, donc pas vérifiés.`,
        cause: "Réponse Jumia incomplète ou changement de format de l'API relevés.",
        recommendation:
          "Vérifier le format des relevés chez Jumia ; aucun montant n'est attribué sans preuve d'origine.",
      });
    }

    for (const anomaly of financialProof.anomalies) {
      anomalies.push(anomaly);
      status = "ecart";
    }

    // --- PREUVE DES COMMANDES (au centime, commande par commande) ---
    const orderProof = await proveOrders({
      shopId: shop.id,
      remoteOrders: orderPages.orders,
      truncated: orderPages.truncated,
    });
    ordersProof = orderProof.proof;

    for (const anomaly of orderProof.anomalies) {
      anomalies.push(anomaly);
      if (anomaly.severity === "critique") status = "ecart";
    }

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
    financials,
    ordersProof,
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


/* ------------------------------------------------------------------ */
/* PREUVE FINANCIÈRE : relevé par relevé, au centime                    */
/* ------------------------------------------------------------------ */

/** Champs monétaires comparés entre le relevé Jumia et la ligne locale. */
const MONEY_FIELDS = [
  { key: "openingBalanceMinor", label: "solde d'ouverture" },
  { key: "itemRevenueMinor", label: "CA articles" },
  { key: "shipmentFeeMinor", label: "frais de livraison" },
  { key: "feesTotalMinor", label: "commissions et frais" },
  { key: "otherRevenueMinor", label: "autres produits" },
  { key: "refundsMinor", label: "remboursements" },
  { key: "closingBalanceMinor", label: "solde net" },
  { key: "payoutAmountMinor", label: "montant versé" },
] as const;

/**
 * Compare chaque relevé renvoyé par Jumia avec la ligne enregistrée, au
 * centime, et mesure les totaux.
 *
 * La conversion passe par `normalizePayoutStatement` — exactement la même
 * fonction que celle utilisée à l'écriture. Un écart mesuré ici est donc un
 * écart **réel** (donnée absente, périmée ou mal attribuée), jamais un
 * artefact de format ou d'arrondi.
 */
async function proveFinancials(params: {
  shopId: string;
  remoteStatements: { shopSid?: string; [key: string]: unknown }[];
  truncated: boolean;
}): Promise<{ proof: FinancialProof; anomalies: CoherenceAnomaly[] }> {
  const db = getDb();
  const localRows = await db
    .select({
      statementNumber: schema.payoutStatements.statementNumber,
      currency: schema.payoutStatements.currency,
      openingBalanceMinor: schema.payoutStatements.openingBalanceMinor,
      itemRevenueMinor: schema.payoutStatements.itemRevenueMinor,
      shipmentFeeMinor: schema.payoutStatements.shipmentFeeMinor,
      feesTotalMinor: schema.payoutStatements.feesTotalMinor,
      otherRevenueMinor: schema.payoutStatements.otherRevenueMinor,
      refundsMinor: schema.payoutStatements.refundsMinor,
      closingBalanceMinor: schema.payoutStatements.closingBalanceMinor,
      payoutAmountMinor: schema.payoutStatements.payoutAmountMinor,
      paid: schema.payoutStatements.paid,
      remoteShopSid: schema.payoutStatements.remoteShopSid,
    })
    .from(schema.payoutStatements)
    .where(eq(schema.payoutStatements.shopId, params.shopId));

  return compareFinancials({
    shopId: params.shopId,
    localRows,
    remoteStatements: params.remoteStatements,
    truncated: params.truncated,
  });
}

/** Ligne locale de relevé, telle que stockée en base. */
export type LocalStatementRow = {
  statementNumber: string;
  currency: string;
  openingBalanceMinor: number;
  itemRevenueMinor: number;
  shipmentFeeMinor: number;
  feesTotalMinor: number;
  otherRevenueMinor: number;
  refundsMinor: number;
  closingBalanceMinor: number;
  payoutAmountMinor: number | null;
  paid: boolean;
  remoteShopSid: string | null;
};

/**
 * Comparaison **pure** entre les relevés distants et les lignes locales.
 *
 * Isoler la comparaison de la lecture en base permet de la tester
 * directement : une preuve qui ne détecte pas une divergence calculée n'a
 * aucune valeur.
 */
export function compareFinancials(params: {
  shopId: string;
  localRows: LocalStatementRow[];
  remoteStatements: { shopSid?: string; [key: string]: unknown }[];
  truncated?: boolean;
}): { proof: FinancialProof; anomalies: CoherenceAnomaly[] } {
  const { shopId, localRows, remoteStatements, truncated = false } = params;
  const anomalies: CoherenceAnomaly[] = [];
  const localByNumber = new Map(localRows.map((row) => [row.statementNumber, row]));

  const details: FinancialProof["details"] = [];
  const totals = {
    local: { revenue: 0, fees: 0, refunds: 0, net: 0 },
    remote: { revenue: 0, fees: 0, refunds: 0, net: 0 },
  };
  let compared = 0;
  let missing = 0;
  let divergent = 0;
  let currency = localRows[0]?.currency ?? "XOF";
  const seen = new Set<string>();

  for (const raw of remoteStatements) {
    const expected = normalizePayoutStatement({
      shopId,
      raw: raw as Record<string, unknown>,
    });
    if (!expected) {
      anomalies.push({
        code: "releve_illisible",
        severity: "avertissement",
        title: "Un relevé Jumia n'a pas pu être décodé",
        evidence: `Relevé « ${String(raw.statementNumber ?? "?")} » : champs obligatoires absents ou illisibles.`,
        cause: "Format de relevé inhabituel renvoyé par l'API Jumia.",
        recommendation: "Aucun montant de ce relevé n'est enregistré ni attribué.",
      });
      continue;
    }

    seen.add(expected.statementNumber);
    currency = expected.currency;

    const local = localByNumber.get(expected.statementNumber);
    if (!local) {
      missing += 1;
      anomalies.push({
        code: "releve_manquant",
        severity: "critique",
        title: `Relevé ${expected.statementNumber} absent de la base`,
        evidence: `Jumia renvoie le relevé ${expected.statementNumber} (CA articles ${formatMoney(expected.itemRevenueMinor, expected.currency)}) alors qu'il n'est pas enregistré pour cette boutique.`,
        cause: "Relevés jamais synchronisés, ou synchronisation interrompue.",
        recommendation: "Resynchroniser les relevés de la boutique.",
      });
      continue;
    }

    compared += 1;
    totals.local.revenue += local.itemRevenueMinor;
    totals.local.fees += local.feesTotalMinor;
    totals.local.refunds += local.refundsMinor;
    totals.local.net += local.closingBalanceMinor;
    totals.remote.revenue += expected.itemRevenueMinor;
    totals.remote.fees += expected.feesTotalMinor;
    totals.remote.refunds += expected.refundsMinor;
    totals.remote.net += expected.closingBalanceMinor;

    const divergences: { field: string; label: string; local: number; remote: number }[] = [];
    for (const field of MONEY_FIELDS) {
      const localValue = local[field.key];
      const remoteValue = expected[field.key];
      if (localValue === null || remoteValue === null) {
        if (localValue !== remoteValue) {
          divergences.push({
            field: field.key,
            label: field.label,
            local: localValue ?? 0,
            remote: remoteValue ?? 0,
          });
        }
        continue;
      }
      if (localValue !== remoteValue) {
        divergences.push({
          field: field.key,
          label: field.label,
          local: localValue,
          remote: remoteValue,
        });
      }
    }
    if (local.currency !== expected.currency) {
      divergences.push({
        field: "currency",
        label: "devise",
        local: 0,
        remote: 0,
      });
    }
    if (local.paid !== expected.paid) {
      divergences.push({
        field: "paid",
        label: "statut de paiement",
        local: local.paid ? 1 : 0,
        remote: expected.paid ? 1 : 0,
      });
    }

    if (divergences.length > 0) {
      divergent += 1;
      for (const divergence of divergences.slice(0, 5)) {
        const detail = {
          statementNumber: expected.statementNumber,
          field: divergence.field,
          local: divergence.local,
          remote: divergence.remote,
        };
        if (details.length < 20) details.push(detail);
        anomalies.push({
          code: "montant_divergent",
          severity: "critique",
          title: `Relevé ${expected.statementNumber} : ${divergence.label} divergent`,
          evidence:
            divergence.field === "currency"
              ? `Devise locale « ${local.currency} » contre « ${expected.currency} » chez Jumia.`
              : divergence.field === "paid"
                ? `Statut de paiement local « ${local.paid ? "versé" : "en attente"} » contre « ${expected.paid ? "versé" : "en attente"} » chez Jumia.`
                : `${divergence.label} : ${formatMoney(divergence.local, expected.currency)} dans l'application contre ${formatMoney(divergence.remote, expected.currency)} chez Jumia (écart ${formatMoney(Math.abs(divergence.remote - divergence.local), expected.currency)}).`,
          cause:
            "Relevé modifié chez Jumia après la dernière synchronisation, ou donnée enregistrée pour une autre boutique.",
          recommendation: "Resynchroniser les relevés de la boutique.",
        });
      }
    }
  }

  // Relevés en base mais absents de la lecture Jumia (hors fenêtre ou
  // lecture tronquée) : information, aucune suppression automatique.
  const extra = localRows.filter((row) => !seen.has(row.statementNumber)).length;
  if (extra > 0 && !truncated) {
    anomalies.push({
      code: "releve_en_trop",
      severity: "information",
      title: `${extra} relevé(s) enregistrés hors de la lecture Jumia`,
      evidence: `${extra} relevé(s) figurent dans la base mais n'ont pas été renvoyés par Jumia sur la fenêtre lue.`,
      cause: "Relevés antérieurs à la fenêtre, ou pagination Jumia limitée.",
      recommendation: "Aucune suppression automatique ; vérifier la pagination si l'écart est suspect.",
    });
  }

  // Totaux : un écart global signale une dérive, pas une simple différence.
  const totalDeltas = {
    revenue: totals.local.revenue - totals.remote.revenue,
    fees: totals.local.fees - totals.remote.fees,
    refunds: totals.local.refunds - totals.remote.refunds,
    net: totals.local.net - totals.remote.net,
  };
  for (const [key, label] of [
    ["revenue", "CA articles"],
    ["fees", "commissions et frais"],
    ["refunds", "remboursements"],
    ["net", "solde net"],
  ] as const) {
    const delta = totalDeltas[key];
    if (delta !== 0) {
      anomalies.push({
        code: "montant_divergent",
        severity: "critique",
        title: `Total « ${label} » divergent sur la période`,
        evidence: `Application : ${formatMoney(totals.local[key], currency)} · Jumia : ${formatMoney(totals.remote[key], currency)} (écart ${formatMoney(Math.abs(delta), currency)}).`,
        cause: "Relevés incomplets, périmés ou attribués à la mauvaise boutique.",
        recommendation: "Resynchroniser les relevés de la boutique et contrôler le périmètre.",
      });
    }
  }

  return {
    proof: {
      compared,
      missing,
      extra,
      divergent,
      local: totals.local,
      remote: totals.remote,
      currency,
      details,
      truncated,
    },
    anomalies,
  };
}


/* ------------------------------------------------------------------ */
/* PREUVE DES COMMANDES : au centime, commande par commande             */
/* ------------------------------------------------------------------ */

/** Ligne locale de commande, telle que stockée en base. */
export type LocalOrderRow = {
  externalOrderId: string;
  orderNumber: string | null;
  status: string;
  currency: string;
  totalAmountMinor: number;
  totalAmountUsdMinor: number | null;
  remoteCreatedAt: Date | null;
};

/**
 * Compare chaque commande renvoyée par Jumia avec la ligne enregistrée.
 *
 * Comme pour les relevés, la conversion passe par `normalizeOrder()` — la
 * fonction utilisée à l'écriture. L'écart mesuré est donc réel.
 *
 * Deux natures d'écart sont distinguées :
 * - **montant** : critique (le chiffre affiché au vendeur serait faux) ;
 * - **statut** : information (Jumia a fait avancer la commande depuis la
 *   dernière copie — la donnée est périmée, pas fausse).
 */
export function compareOrders(params: {
  shopId: string;
  localRows: LocalOrderRow[];
  remoteOrders: unknown[];
  truncated?: boolean;
}): { proof: OrderProof; anomalies: CoherenceAnomaly[] } {
  const { shopId, localRows, remoteOrders, truncated = false } = params;
  const anomalies: CoherenceAnomaly[] = [];
  const localById = new Map(localRows.map((row) => [row.externalOrderId, row]));

  const details: OrderProof["details"] = [];
  const totals = {
    local: { amountMinor: 0, usdMinor: 0 },
    remote: { amountMinor: 0, usdMinor: 0 },
  };
  let compared = 0;
  let missing = 0;
  let divergent = 0;
  let outdated = 0;
  let currency = localRows[0]?.currency ?? "XOF";
  const seen = new Set<string>();

  for (const raw of remoteOrders) {
    const expected = normalizeOrder(shopId, raw);
    if (!expected) {
      anomalies.push({
        code: "donnees_sans_provenance",
        severity: "avertissement",
        title: "Une commande Jumia n'a pas pu être décodée",
        evidence: "La commande renvoyée par Jumia est sans identifiant ou sans statut : elle n'est ni comparable ni enregistrée.",
        cause: "Format de commande inhabituel renvoyé par l'API Jumia.",
        recommendation: "Aucun montant de cette commande n'est attribué.",
      });
      continue;
    }

    seen.add(expected.externalOrderId);
    const orderCurrency = expected.currency ?? currency;
    currency = orderCurrency;

    const local = localById.get(expected.externalOrderId);
    if (!local) {
      missing += 1;
      anomalies.push({
        code: "commande_manquante",
        severity: "critique",
        title: `Commande ${expected.orderNumber ?? expected.externalOrderId} absente de la base`,
        evidence: `Jumia renvoie la commande ${expected.orderNumber ?? expected.externalOrderId} (${formatMoney(expected.totalAmountMinor, orderCurrency)}) alors qu'elle n'est pas enregistrée pour cette boutique.`,
        cause: "Commandes jamais synchronisées, ou synchronisation interrompue.",
        recommendation: "Resynchroniser les commandes de la boutique.",
      });
      continue;
    }

    compared += 1;
    totals.local.amountMinor += local.totalAmountMinor;
    totals.local.usdMinor += local.totalAmountUsdMinor ?? 0;
    totals.remote.amountMinor += expected.totalAmountMinor;
    totals.remote.usdMinor += expected.totalAmountUsdMinor ?? 0;

    // --- Montants : doivent être identiques au centime ---
    const divergences: { field: string; label: string; local: number; remote: number }[] = [];
    if (local.totalAmountMinor !== expected.totalAmountMinor) {
      divergences.push({
        field: "totalAmountMinor",
        label: "montant de la commande",
        local: local.totalAmountMinor,
        remote: expected.totalAmountMinor,
      });
    }
    const localUsd = local.totalAmountUsdMinor;
    const remoteUsd = expected.totalAmountUsdMinor;
    if (localUsd !== remoteUsd) {
      divergences.push({
        field: "totalAmountUsdMinor",
        label: "montant en USD",
        local: localUsd ?? 0,
        remote: remoteUsd ?? 0,
      });
    }
    if (local.currency !== expected.currency) {
      divergences.push({
        field: "currency",
        label: "devise",
        local: 0,
        remote: 0,
      });
    }

    if (divergences.length > 0) {
      divergent += 1;
      for (const divergence of divergences.slice(0, 3)) {
        if (details.length < 20) {
          details.push({
            externalOrderId: expected.externalOrderId,
            field: divergence.field,
            local: divergence.local,
            remote: divergence.remote,
          });
        }
        anomalies.push({
          code: "montant_divergent",
          severity: "critique",
          title: `Commande ${expected.orderNumber ?? expected.externalOrderId} : ${divergence.label} divergent`,
          evidence:
            divergence.field === "currency"
              ? `Devise locale « ${local.currency} » contre « ${expected.currency} » chez Jumia.`
              : `${divergence.label} : ${formatMoney(divergence.local, orderCurrency)} dans l'application contre ${formatMoney(divergence.remote, orderCurrency)} chez Jumia (écart ${formatMoney(Math.abs(divergence.remote - divergence.local), orderCurrency)}).`,
          cause:
            "Commande modifiée chez Jumia après la dernière synchronisation, ou donnée enregistrée pour une autre boutique.",
          recommendation: "Resynchroniser les commandes de la boutique.",
        });
      }
    }

    // --- Statut : la donnée est périmée, pas fausse ---
    if (local.status !== expected.status) {
      outdated += 1;
      anomalies.push({
        code: "commande_non_synchronisee",
        severity: "information",
        title: `Commande ${expected.orderNumber ?? expected.externalOrderId} : statut périmé`,
        evidence: `L'application indique « ${local.status} », Jumia indique « ${expected.status} ».`,
        cause: "La commande a changé depuis la dernière synchronisation.",
        recommendation: "Resynchroniser pour actualiser les statuts.",
      });
    }
  }

  // Commandes en base hors de la lecture Jumia (fenêtre, pagination).
  const extra = localRows.filter((row) => !seen.has(row.externalOrderId)).length;
  if (extra > 0 && !truncated) {
    anomalies.push({
      code: "commande_en_trop",
      severity: "information",
      title: `${extra} commande(s) enregistrées hors de la fenêtre Jumia`,
      evidence: `${extra} commande(s) figurent dans la base mais n'ont pas été renvoyées par Jumia sur la fenêtre lue.`,
      cause: "Commandes plus anciennes que la fenêtre, ou pagination Jumia limitée.",
      recommendation: "Aucune suppression automatique ; vérifier la pagination si l'écart est suspect.",
    });
  }

  // Totaux : un écart global signale une dérive, pas une simple différence.
  const amountDelta = totals.local.amountMinor - totals.remote.amountMinor;
  if (amountDelta !== 0) {
    anomalies.push({
      code: "montant_divergent",
      severity: "critique",
      title: "Total des commandes divergent sur la fenêtre",
      evidence: `Application : ${formatMoney(totals.local.amountMinor, currency)} · Jumia : ${formatMoney(totals.remote.amountMinor, currency)} (écart ${formatMoney(Math.abs(amountDelta), currency)}).`,
      cause: "Commandes incomplètes, périmées ou attribuées à la mauvaise boutique.",
      recommendation: "Resynchroniser les commandes de la boutique et contrôler le périmètre.",
    });
  }

  return {
    proof: {
      compared,
      missing,
      extra,
      divergent,
      outdated,
      local: totals.local,
      remote: totals.remote,
      currency,
      details,
      truncated,
    },
    anomalies,
  };
}

/** Lecture locale des commandes de la boutique, puis comparaison. */
async function proveOrders(params: {
  shopId: string;
  remoteOrders: unknown[];
  truncated: boolean;
}): Promise<{ proof: OrderProof; anomalies: CoherenceAnomaly[] }> {
  const db = getDb();
  const localRows = await db
    .select({
      externalOrderId: schema.orders.externalOrderId,
      orderNumber: schema.orders.orderNumber,
      status: schema.orders.status,
      currency: schema.orders.currency,
      totalAmountMinor: schema.orders.totalAmountMinor,
      totalAmountUsdMinor: schema.orders.totalAmountUsdMinor,
      remoteCreatedAt: schema.orders.remoteCreatedAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.shopId, params.shopId));

  return compareOrders({
    shopId: params.shopId,
    localRows,
    remoteOrders: params.remoteOrders,
    truncated: params.truncated,
  });
}
