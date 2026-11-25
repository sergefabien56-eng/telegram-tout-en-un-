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
 * Supprime boutiques, membres, comptes de test et tentatives de connexion.
 *
 * `shops.owner_user_id` est en RESTRICT : les boutiques et les membres sont
 * supprimés avant les comptes.
 */
export async function purgeTestAccounts(
  pool: Pool,
  options: { alsoAttempts?: boolean } = {},
): Promise<{ shops: number; members: number; users: number; attempts: number }> {
  const members = await pool.query(
    `DELETE FROM shop_members WHERE user_id IN (SELECT id FROM users WHERE email ~ $1)`,
    [TEST_EMAIL_PATTERN],
  );
  const shops = await pool.query(
    `DELETE FROM shops WHERE owner_user_id IN (SELECT id FROM users WHERE email ~ $1)`,
    [TEST_EMAIL_PATTERN],
  );
  const users = await pool.query(`DELETE FROM users WHERE email ~ $1 RETURNING id`, [
    TEST_EMAIL_PATTERN,
  ]);
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
