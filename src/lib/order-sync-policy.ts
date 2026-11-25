/**
 * Politique de synchronisation des commandes — module **pur** (sans base),
 * importable depuis le navigateur comme depuis le serveur.
 *
 * Les deux seuils viennent de l'API Jumia Vendor Center, documentée dans
 * `docs/jumia-integration.md` : `/orders` ne relit pas plus de 90 jours, et
 * la pagination est plafonnée par le quota (200 requêtes/minute).
 */

/** Plage maximale relisible en une fois (limite de l'API Jumia). */
export const MAX_SYNC_WINDOW_DAYS = 90;

/**
 * Au-delà de cette fenêtre, l'interface demande une **confirmation**
 * explicite avant de lancer la synchronisation.
 */
export const LARGE_SYNC_WINDOW_DAYS = 30;

/** Taille de page utilisée pour `/orders`. */
export const ORDERS_PAGE_SIZE = 200;

/** Nombre maximal de pages lues par synchronisation (protection du quota). */
export const ORDERS_MAX_PAGES = 5;

/**
 * Validation d'une période de synchronisation.
 *
 * Règles :
 * - les deux bornes sont obligatoires (une période incomplète est refusée) ;
 * - la période ne peut pas être inversée ;
 * - la fenêtre ne peut pas dépasser la limite de l'API Jumia.
 *
 * Fonction **pure** : elle est utilisée par la route API et par l'interface,
 * qui doivent refuser exactement la même chose.
 */
export type SyncWindowValidation =
  | { ok: true; from: Date; to: Date; spanDays: number; large: boolean }
  | { ok: false; reason: string };

export function validateSyncWindow(from: Date | null, to: Date | null): SyncWindowValidation {
  if (!from || !to) {
    return {
      ok: false,
      reason: "Période incomplète : les dates « Du » et « Au » sont toutes deux requises.",
    };
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, reason: "Période invalide : les dates saisies sont illisibles." };
  }
  if (from > to) {
    return {
      ok: false,
      reason: "Période inversée : la date « Du » est postérieure à la date « Au ».",
    };
  }
  const spanDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (spanDays > MAX_SYNC_WINDOW_DAYS) {
    return {
      ok: false,
      reason: `Période trop large : l'API Jumia ne permet de relire que ${MAX_SYNC_WINDOW_DAYS} jours à la fois.`,
    };
  }
  return { ok: true, from, to, spanDays, large: spanDays > LARGE_SYNC_WINDOW_DAYS };
}
