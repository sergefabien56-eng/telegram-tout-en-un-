/**
 * Garde-fous « une boutique, une donnée ».
 *
 * Jumia peut renvoyer, sur un même compte vendeur, des objets appartenant à
 * plusieurs boutiques. Avant d'enregistrer une donnée, on compare
 * l'identifiant de boutique que Jumia a mis dans la charge utile avec la
 * boutique ciblée : si elle diffère, la donnée est **écartée** (jamais
 * enregistrée sous une autre boutique).
 *
 * Quand Jumia ne fournit pas cet identifiant, on ne peut rien proving : la
 * donnée est alors conservée telle quelle, sans jamais inventer d'information.
 */

type Raw = Record<string, unknown> | null | undefined;

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

/** `shopIds` d'une commande Jumia (tableau d'identifiants de boutique). */
export function orderShopIds(raw: Raw): string[] | null {
  const record = asRecord(raw);
  if (!record) return null;
  const value = record.shopIds;
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return ids.length > 0 ? ids : null;
}

/** `shopSid` d'un relevé de versement Jumia. */
export function statementShopSid(raw: Raw): string | null {
  const record = asRecord(raw);
  if (!record) return null;
  const value = record.shopSid;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `shop.id` d'un produit Jumia. */
export function productShopId(raw: Raw): string | null {
  const record = asRecord(raw);
  if (!record) return null;
  const shop = asRecord(record.shop);
  if (!shop) return null;
  const value = shop.id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * La donnée appartient-elle à la boutique ciblée ?
 *
 * - si Jumia donne l'identifiant et qu'il diffère → `false` (donnée écartée) ;
 * - si Jumia ne donne pas d'identifiant → `true` (aucune preuve de mélange).
 */
export function belongsToShop(
  remoteIds: string[] | string | null,
  targetRemoteShopId: string | null | undefined,
): boolean {
  if (!targetRemoteShopId) return true;
  if (remoteIds === null) return true;
  const list = Array.isArray(remoteIds) ? remoteIds : [remoteIds];
  return list.includes(targetRemoteShopId);
}
