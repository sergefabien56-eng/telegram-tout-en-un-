/** Constantes du cookie de session (R4). */
export const SESSION_COOKIE = "teu_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 jours

/**
 * Interface choisie : `mini` = coquille Telegram (bottom nav), `web` = coquille classique.
 * Posé par la Mini App ; lisible par le client pour immédiatement appliquer la bonne coquille.
 */
export const UI_COOKIE = "teu_ui";
