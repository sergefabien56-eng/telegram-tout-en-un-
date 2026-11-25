import { and, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * État de connexion **factuel** d'une boutique.
 *
 * Le statut stocké (`shops.status`) est posé au moment du rattachement : il ne
 * prouve rien. Un statut vert « connectée » doit signifier « le lien existe,
 * le compte vendeur répond et les données arrivent réellement ».
 *
 * Ces états sont calculés à partir de faits (base + journal de
 * synchronisation) ; le test réseau du jeton et la preuve de cohérence
 * appartiennent au diagnostic (`@/lib/diagnostics`).
 */
export type ConnectionState =
  /** Boutique créée localement, pas encore rattachée à une boutique Jumia. */
  | "non_rattachee"
  /** Rattachée à une boutique Jumia mais sans compte vendeur lié. */
  | "compte_manquant"
  /** Le compte vendeur lié est marqué expiré (jeton refusé). */
  | "compte_invalide"
  /** Rattachée et compte valide, mais aucune donnée n'a encore été reçue. */
  | "connectee_sans_donnees"
  /** Données reçues, mais la dernière synchronisation a échoué. */
  | "donnees_incompletes"
  /** Rattachée, compte valide, données reçues, dernière synchronisation OK. */
  | "connectee";

export type ConnectionLabel = {
  state: ConnectionState;
  /** Libellé court affiché dans l'interface. */
  label: string;
  /** Explication honnête : ce que l'on sait, ce qui manque. */
  detail: string;
  /** `true` si la boutique est réellement opérationnelle (données qui arrivent). */
  operational: boolean;
};

export type ShopConnection = ConnectionLabel & {
  shopId: string;
  name: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
  accountId: string | null;
  accountLabel: string | null;
  accountStatus: string | null;
  linkedAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  counts: { products: number; variants: number; orders: number; statements: number };
};

/** Volumes réellement enregistrés pour une boutique (jamais estimés). */
export async function shopVolumes(
  shopIds: string[],
): Promise<Map<string, { products: number; variants: number; orders: number; statements: number }>> {
  const result = new Map<
    string,
    { products: number; variants: number; orders: number; statements: number }
  >();
  if (shopIds.length === 0) return result;
  const db = getDb();

  const products = await db
    .select({ shopId: schema.products.shopId, total: count() })
    .from(schema.products)
    .where(inArray(schema.products.shopId, shopIds))
    .groupBy(schema.products.shopId);
  const variants = await db
    .select({ shopId: schema.products.shopId, total: count(schema.productVariants.id) })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(inArray(schema.products.shopId, shopIds))
    .groupBy(schema.products.shopId);
  const orders = await db
    .select({ shopId: schema.orders.shopId, total: count() })
    .from(schema.orders)
    .where(inArray(schema.orders.shopId, shopIds))
    .groupBy(schema.orders.shopId);
  const statements = await db
    .select({ shopId: schema.payoutStatements.shopId, total: count() })
    .from(schema.payoutStatements)
    .where(inArray(schema.payoutStatements.shopId, shopIds))
    .groupBy(schema.payoutStatements.shopId);

  for (const id of shopIds) {
    result.set(id, { products: 0, variants: 0, orders: 0, statements: 0 });
  }
  const merge = (
    rows: { shopId: string; total: number }[],
    key: "products" | "variants" | "orders" | "statements",
  ) => {
    for (const row of rows) {
      const entry = result.get(row.shopId);
      if (entry) entry[key] = row.total;
    }
  };
  merge(products, "products");
  merge(variants, "variants");
  merge(orders, "orders");
  merge(statements, "statements");
  return result;
}

/**
 * État de connexion de chaque boutique, calculé sur des faits.
 */
export async function connectionStates(shopIds: string[]): Promise<Map<string, ConnectionLabel>> {
  const result = new Map<string, ConnectionLabel>();
  if (shopIds.length === 0) return result;
  const db = getDb();

  const rows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      remoteShopId: schema.shops.remoteShopId,
      remoteShopName: schema.shops.remoteShopName,
      remoteLinkedAt: schema.shops.remoteLinkedAt,
      lastSyncAt: schema.shops.lastSyncAt,
      lastSyncStatus: schema.shops.lastSyncStatus,
      jumiaAccountId: schema.shops.jumiaAccountId,
      accountLabel: schema.jumiaAccounts.label,
      accountStatus: schema.jumiaAccounts.status,
    })
    .from(schema.shops)
    .leftJoin(schema.jumiaAccounts, eq(schema.shops.jumiaAccountId, schema.jumiaAccounts.id))
    .where(inArray(schema.shops.id, shopIds));

  const volumes = await shopVolumes(shopIds);

  for (const row of rows) {
    result.set(row.id, connectionLabelFor(row, volumes.get(row.id)));
  }
  return result;
}

/** Règles d'état, isolées pour être testées sans base. */
export function connectionLabelFor(
  shop: {
    remoteShopId: string | null;
    remoteShopName: string | null;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
    jumiaAccountId: string | null;
    accountStatus: string | null;
  },
  counts: { products: number; variants: number; orders: number; statements: number } | undefined,
): ConnectionLabel {
  const volume = counts ?? { products: 0, variants: 0, orders: 0, statements: 0 };

  if (!shop.remoteShopId) {
    return {
      state: "non_rattachee",
      label: "Non rattachée",
      detail:
        "La boutique existe dans l'application mais n'est rattachée à aucune boutique Jumia : aucune donnée ne peut arriver.",
      operational: false,
    };
  }

  if (!shop.jumiaAccountId) {
    return {
      state: "compte_manquant",
      label: "Compte vendeur manquant",
      detail:
        "Boutique rattachée, mais aucun compte vendeur Jumia n'est lié : la synchronisation est refusée (une boutique ne lit jamais le compte d'une autre).",
      operational: false,
    };
  }

  if (shop.accountStatus && shop.accountStatus !== "active") {
    return {
      state: "compte_invalide",
      label: "Compte vendeur invalide",
      detail: `Le compte vendeur lié est « ${shop.accountStatus} » : le refresh token est refusé par Jumia, il faut le renouveler.`,
      operational: false,
    };
  }

  const hasData = volume.products + volume.orders + volume.statements > 0;

  if (!hasData) {
    return {
      state: "connectee_sans_donnees",
      label: "Rattachée, aucune donnée",
      detail:
        "Le lien est établi et le compte vendeur répond, mais aucune commande, aucun produit et aucun relevé n'ont encore été reçus : la boutique n'est pas encore opérationnelle.",
      operational: false,
    };
  }

  if (shop.lastSyncStatus && shop.lastSyncStatus !== "ok") {
    return {
      state: "donnees_incompletes",
      label: "Données incomplètes",
      detail: `La dernière synchronisation s'est terminée en « ${shop.lastSyncStatus} » : les données affichées peuvent être partielles.`,
      operational: false,
    };
  }

  return {
    state: "connectee",
    label: "Connectée",
    detail: `Données reçues et synchronisées${shop.lastSyncAt ? ` (dernière synchronisation : ${shop.lastSyncAt.toISOString().slice(0, 16).replace("T", " ")})` : ""}.`,
    operational: true,
  };
}

/** Connexion d'une boutique (faits + état) pour l'interface. */
export async function shopConnection(shopId: string): Promise<ShopConnection | null> {
  const states = await connectionStates([shopId]);
  const label = states.get(shopId);
  if (!label) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      remoteShopId: schema.shops.remoteShopId,
      remoteShopName: schema.shops.remoteShopName,
      remoteLinkedAt: schema.shops.remoteLinkedAt,
      lastSyncAt: schema.shops.lastSyncAt,
      lastSyncStatus: schema.shops.lastSyncStatus,
      jumiaAccountId: schema.shops.jumiaAccountId,
      accountLabel: schema.jumiaAccounts.label,
      accountStatus: schema.jumiaAccounts.status,
    })
    .from(schema.shops)
    .leftJoin(schema.jumiaAccounts, eq(schema.shops.jumiaAccountId, schema.jumiaAccounts.id))
    .where(and(eq(schema.shops.id, shopId)))
    .limit(1);
  const shop = rows[0];
  if (!shop) return null;
  const volumes = await shopVolumes([shopId]);
  return {
    ...label,
    shopId: shop.id,
    name: shop.name,
    remoteShopId: shop.remoteShopId,
    remoteShopName: shop.remoteShopName,
    accountId: shop.jumiaAccountId,
    accountLabel: shop.accountLabel,
    accountStatus: shop.accountStatus,
    linkedAt: shop.remoteLinkedAt,
    lastSyncAt: shop.lastSyncAt,
    lastSyncStatus: shop.lastSyncStatus,
    counts: volumes.get(shopId) ?? { products: 0, variants: 0, orders: 0, statements: 0 },
  };
}
