/**
 * PRÉPARATION DES COMMANDES JUMIA — `POST /orders/pack` et
 * `POST /orders/ready-to-ship`.
 *
 * **Ce que ces deux appels font.**
 * - `pack` marque des articles comme **emballés** : Jumia crée le colis et
 *   renvoie son numéro de suivi ;
 * - `ready-to-ship` marque des articles **prêts à expédier** chez Jumia.
 *
 * **Ce qu'ils ne font pas.** « Prêt à expédier » n'est **pas** « expédié » :
 * le transporteur n'a pas encore pris le colis. L'application ne modifie
 * jamais un statut de commande par elle-même : seul le retour de Jumia fait
 * foi.
 *
 * **Réponses partielles.** Les deux endpoints répondent `201` avec, dans la
 * même enveloppe, la liste des articles **réussis** (`success.packages`) et
 * celle des articles **en erreur** (`error.orderItems`, avec un code et un
 * message par article). Une réponse `201` ne signifie donc pas « tout a
 * réussi » : le résultat est toujours décompté article par article.
 *
 * **Rôle Jumia requis.** Les deux endpoints exigent le rôle
 * **VC - Order Manager**. Un compte qui ne l'a pas se voit refuser l'appel :
 * le refus est remonté tel quel, sans être maquillé en succès.
 */

import { jumiaGet, jumiaPost } from "@/lib/jumia/request";
import { JumiaError } from "@/lib/jumia/client";

/** Transporteur proposé par Jumia pour un article. */
export type ShipmentProvider = {
  id: string;
  name: string;
  /** Le transporteur exige-t-il un code de suivi pour créer le colis ? */
  trackingCodeRequired: boolean;
};

/** Transporteurs disponibles pour un ensemble d'articles. */
export type ShipmentProvidersResult = {
  /** Transporteurs par identifiant d'article. */
  byItem: Map<string, ShipmentProvider[]>;
  /** Transporteurs proposés pour au moins un article (union). */
  all: ShipmentProvider[];
};

/**
 * Résultat d'un appel qui agit sur des articles, article par article.
 */
export type ItemOutcome = {
  id: string;
  ok: boolean;
  /** Code d'erreur Jumia (`not_allowed_status`, …) ou `null` si succès. */
  code: string | null;
  /** Message d'erreur Jumia, ou `null` si succès. */
  message: string | null;
  /** Numéro de suivi du colis créé, quand Jumia le fournit. */
  trackingNumber: string | null;
  /** Pays du colis, quand Jumia le fournit. */
  countryCode: string | null;
};

/** Résultat d'un appel « pack » ou « ready-to-ship ». */
export type PreparationOutcome = {
  /** Articles Scatterbys Jumia. */
  succeeded: ItemOutcome[];
  /** Articles refusés par Jumia. */
  failed: ItemOutcome[];
  /** Statut HTTP de la réponse (201 attendu). */
  httpStatus: number;
  /** Message d'erreur global, si Jumia a refusé l'appel entier. */
  error: string | null;
  /** Le code d'erreur global, s'il y en a un. */
  code: string | null;
};

/** Nombre maximum d'articles par appel (prudence : les lots Jumia sont Bornés). */
export const PREPARATION_MAX_ITEMS = 50;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Extrait la liste des articles en erreur d'une enveloppe Jumia.
 *
 * La forme observée dans la documentation officielle :
 * `error.orderItems = [{ id, response: { code, message } }]`.
 */
export function parseItemErrors(body: unknown): ItemOutcome[] {
  const error = (body as { error?: { orderItems?: unknown } } | null)?.error;
  const items = Array.isArray(error?.orderItems) ? error.orderItems : [];
  const out: ItemOutcome[] = [];
  for (const raw of items) {
    const item = raw as {
      id?: unknown;
      response?: { code?: unknown; message?: unknown } | null;
    };
    const id = asString(item?.id);
    if (!id) continue;
    out.push({
      id,
      ok: false,
      code: asString(item?.response?.code) ?? "erreur",
      message: asString(item?.response?.message) ?? "Jumia a refusé cet article.",
      trackingNumber: null,
      countryCode: null,
    });
  }
  return out;
}

/**
 * Extrait la liste des articles réussis d'une enveloppe Jumia.
 *
 * Jumia regroupe les articles réussis par colis (`success.packages`), avec
 * pour chaque colis les identifiants d'articles, le pays et le numéro de
 * suivi. Les articles sont « dépliés » : on en garde un par article.
 */
export function parseItemSuccesses(body: unknown): ItemOutcome[] {
  const success = (body as { success?: { packages?: unknown } } | null)?.success;
  const packages = Array.isArray(success?.packages) ? success.packages : [];
  const out: ItemOutcome[] = [];
  for (const raw of packages) {
    const pack = raw as {
      orderItems?: unknown;
      countryCode?: unknown;
      trackingNumber?: unknown;
    };
    const ids = Array.isArray(pack?.orderItems) ? pack.orderItems : [];
    for (const rawId of ids) {
      const id = asString(rawId);
      if (!id) continue;
      out.push({
        id,
        ok: true,
        code: null,
        message: null,
        trackingNumber: asString(pack?.trackingNumber),
        countryCode: asString(pack?.countryCode),
      });
    }
  }
  return out;
}

/**
 * Analyse la réponse d'un appel `pack` ou `ready-to-ship`.
 *
 * La réponse est traitée **article par article** : un `201` peut contenir à
 * la fois des réussites et des refus.
 */
export function parsePreparationResponse(body: unknown, httpStatus: number): PreparationOutcome {
  const succeeded = parseItemSuccesses(body);
  const failed = parseItemErrors(body);
  const global = body as { error?: { code?: unknown; message?: unknown } | null } | null;
  const globalCode = asString(global?.error?.code);
  const globalMessage = asString(global?.error?.message);
  return {
    succeeded,
    failed,
    httpStatus,
    error: globalMessage ?? null,
    code: globalCode ?? null,
  };
}

/** Message lisible pour un refus Jumia. */
export function describeJumiaRefusal(outcome: PreparationOutcome): string {
  if (outcome.error) return outcome.error;
  if (outcome.failed.length === 0) return "Jumia n'a renvoyé aucun article en erreur.";
  const premier = outcome.failed[0];
  if (!premier) return "Jumia a refusé la demande.";
  const autres = outcome.failed.length - 1;
  return `${premier.message ?? "Jumia a refusé cet article."}${
    autres > 0 ? ` (${autres} autre${autres > 1 ? "s" : ""} article${autres > 1 ? "s" : ""} refusé${autres > 1 ? "s" : ""})` : ""
  }`;
}

/**
 * Transporteurs disponibles pour les articles donnés.
 *
 * L'API ne renvoie que les transporteurs **actifs** et **associés** à la
 * boutique des articles ; pour une commande à paiement à la livraison, seuls
 * les transporteurs « COD » sont proposés. Ce filtre est fait par Jumia :
 * l'application ne l'invente pas.
 */
export async function fetchShipmentProviders(params: {
  shopId: string;
  orderItemIds: string[];
}): Promise<ShipmentProvidersResult> {
  const ids = params.orderItemIds.filter((id) => id.length > 0).slice(0, PREPARATION_MAX_ITEMS);
  const byItem = new Map<string, ShipmentProvider[]>();
  const all: ShipmentProvider[] = [];
  if (ids.length === 0) return { byItem, all };

  const response = await jumiaGet(
    "/orders/shipment-providers",
    { orderItemId: ids },
    { shopId: params.shopId },
  );
  if (!response.ok) {
    throw new JumiaError(
      `Jumia n'a pas renvoyé les transporteurs (HTTP ${response.status}).`,
      "shipment_providers",
      response.status,
    );
  }
  const body = (await response.json()) as {
    orderItems?: { id?: unknown; shipmentProviders?: unknown }[];
  };
  const items = Array.isArray(body?.orderItems) ? body.orderItems : [];
  for (const raw of items) {
    const id = asString(raw?.id);
    if (!id) continue;
    const providers: ShipmentProvider[] = [];
    const rawProviders = Array.isArray(raw?.shipmentProviders) ? raw.shipmentProviders : [];
    for (const rawProvider of rawProviders) {
      const provider = rawProvider as {
        id?: unknown;
        name?: unknown;
        trackingCodeRequired?: unknown;
      };
      const providerId = asString(provider?.id);
      if (!providerId) continue;
      const entry: ShipmentProvider = {
        id: providerId,
        name: asString(provider?.name) ?? providerId,
        trackingCodeRequired: asBoolean(provider?.trackingCodeRequired),
      };
      providers.push(entry);
      if (!all.some((candidate) => candidate.id === entry.id)) all.push(entry);
    }
    byItem.set(id, providers);
  }
  return { byItem, all };
}

/**
 * Prépare (emballe) des articles : `POST /orders/pack`.
 *
 * Jumia exige un **transporteur par article** : deux articles d'un même colis
 * doivent partager le même transporteur, le même pays et le même mode
 * d'expédition. La validation est faite par Jumia ; l'application transmet
 * et rapporte son verdict.
 */
export async function packOrderItems(params: {
  shopId: string;
  items: { id: string; shipmentProviderId: string }[];
}): Promise<PreparationOutcome> {
  const items = params.items
    .filter((item) => item.id && item.shipmentProviderId)
    .slice(0, PREPARATION_MAX_ITEMS);
  if (items.length === 0) {
    return {
      succeeded: [],
      failed: [],
      httpStatus: 0,
      error: "Aucun article à préparer.",
      code: "aucun_article",
    };
  }

  const response = await jumiaPost(
    "/orders/pack",
    { orderItems: items.map((item) => ({ id: item.id, shipmentProviderId: item.shipmentProviderId })) },
    { shopId: params.shopId },
  );
  const body = await safeJson(response);
  return parsePreparationResponse(body, response.status);
}

/**
 * Demande le passage « Prêtes à expédier » : `POST /orders/ready-to-ship`.
 *
 * L'appel ne prend que des **identifiants d'articles**. Le résultat est
 * renvoyé tel quel, article par article : l'application ne déclare une
 * commande « prête à expédier » que si Jumia l'a confirmé.
 */
export async function markOrderItemsReadyToShip(params: {
  shopId: string;
  orderItemIds: string[];
}): Promise<PreparationOutcome> {
  const ids = params.orderItemIds.filter((id) => id.length > 0).slice(0, PREPARATION_MAX_ITEMS);
  if (ids.length === 0) {
    return {
      succeeded: [],
      failed: [],
      httpStatus: 0,
      error: "Aucun article à marquer prêt à expédier.",
      code: "aucun_article",
    };
  }

  const response = await jumiaPost(
    "/orders/ready-to-ship",
    { orderItemIds: ids },
    { shopId: params.shopId },
  );
  const body = await safeJson(response);
  return parsePreparationResponse(body, response.status);
}

/** Lit le corps d'une réponse sans faire échouer l'appel en cas de HTML. */
async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
