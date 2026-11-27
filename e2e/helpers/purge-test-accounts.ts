import type { Pool } from "pg";

/**
 * Purge les comptes de test (harnais E2E et smokes) de la base.
 *
 * Tous les comptes de test utilisent l'adresse de démonstration `@exemple.ci`
 * (domaine réservé) : le motif est donc volontairement large, pour qu'aucun
 * résidu ne subsiste en production. Les comptes réels (adresse réelle) ne sont
 * jamais concernés.
 */
export const TEST_EMAIL_PATTERN = ".*@exemple\\.ci$";

/**
 * Comptes **protégés** : jamais supprimés, même s'ils portent une adresse
 * `@exemple.ci`.
 *
 * Le compte de démonstration (`scripts/demo-account.mjs`) sert à montrer
 * l'application avec les vraies boutiques. Le supprimer à chaque passage de
 * la suite E2E le ferait disparaître : l'utilisateur se retrouverait sans
 * accès, et les captures de l'application ne seraient plus possibles.
 *
 * La même liste existe dans `scripts/cleanup-test-accounts.mjs` : les deux
 * chemins de nettoyage doivent protéger ce compte.
 */
export const PROTECTED_EMAILS = ["demo-captures@exemple.ci"];

/**
 * Supprime boutiques, membres, comptes de test et tentatives de connexion.
 *
 * `shops.owner_user_id` est en RESTRICT : les boutiques et les membres sont
 * supprimés avant les comptes.
 */
export async function purgeTestAccounts(
  pool: Pool,
  options: { alsoAttempts?: boolean } = {},
): Promise<{ shops: number; members: number; users: number; attempts: number }> {
  const protectedEmails = options.protectedEmails ?? PROTECTED_EMAILS;
  const members = await pool.query(
    `DELETE FROM shop_members WHERE user_id IN (
       SELECT id FROM users WHERE email ~ $1 AND NOT (email = ANY($2::text[])))`,
    [TEST_EMAIL_PATTERN, protectedEmails],
  );
  const shops = await pool.query(
    `DELETE FROM shops WHERE owner_user_id IN (
       SELECT id FROM users WHERE email ~ $1 AND NOT (email = ANY($2::text[])))`,
    [TEST_EMAIL_PATTERN, protectedEmails],
  );
  const users = await pool.query(
    `DELETE FROM users WHERE email ~ $1 AND NOT (email = ANY($2::text[])) RETURNING id`,
    [TEST_EMAIL_PATTERN, protectedEmails],
  );
  let attempts = 0;
  if (options.alsoAttempts !== false) {
    const deleted = await pool.query(`DELETE FROM login_attempts`);
    attempts = deleted.rowCount ?? 0;
  }
  return {
    shops: shops.rowCount ?? 0,
    members: members.rowCount ?? 0,
    users: users.rowCount ?? 0,
    attempts,
  };
}
