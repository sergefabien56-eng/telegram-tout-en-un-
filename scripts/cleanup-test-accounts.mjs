/**
 * Supprime les comptes de test (smokes) de la base.
 * Usage : node scripts/cleanup-test-accounts.mjs [--orphans]
 *   --orphans : supprime aussi les lignes d'audit orphelines (user_id NULL)
 *               des actions qui portent toujours un utilisateur. Les échecs de
 *               connexion et les demandes de réinitialisation anonymes sont
 *               volontairement conservés.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");
const withOrphans = process.argv.includes("--orphans");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const patterns = ["2fa%@exemple.ci", "dbg%@exemple.ci", "smoke%@exemple.ci", "%test%", "%example.ci"];

// 1. Journal d'audit rattaché aux comptes de test (avant suppression des comptes).
const ids = await pool.query(`SELECT id FROM users WHERE email LIKE ANY($1::text[])`, [patterns]);
const userIds = ids.rows.map((row) => row.id);
let auditDeleted = 0;
if (userIds.length > 0) {
  const removed = await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [userIds]);
  auditDeleted = removed.rowCount ?? 0;
}

// 2. Comptes de test.
const res = await pool.query(`DELETE FROM users WHERE email LIKE ANY($1::text[]) RETURNING id, email`, [
  patterns,
]);
console.log(`Comptes supprimés : ${res.rowCount}`);
for (const row of res.rows) console.log(`  - ${row.email} (${row.id})`);
console.log(`Lignes d'audit rattachées supprimées : ${auditDeleted}`);

// 3. Résidus de test devenus orphelins lors des passes précédentes.
if (withOrphans) {
  const ALWAYS_OWNED = [
    "auth.register",
    "auth.login",
    "auth.logout",
    "auth.telegram_link_code",
    "auth.telegram_linked",
    "shop.created",
    "shop.updated",
    "shop.selected",
    "shop.disconnected",
    "shop.member_invited",
    "shop.member_removed",
    "shop.member_role_changed",
    "notifications.pref_changed",
  ];
  const twoFactor = await pool.query(
    `DELETE FROM audit_logs WHERE user_id IS NULL AND action LIKE 'auth.two_factor_%'`,
  );
  const owned = await pool.query(
    `DELETE FROM audit_logs WHERE user_id IS NULL AND action = ANY($1::text[])`,
    [ALWAYS_OWNED],
  );
  console.log(
    `Audit orphelin supprimé : ${twoFactor.rowCount ?? 0} (2FA) + ${owned.rowCount ?? 0} (actions rattachées)`,
  );
} else {
  console.log("(option --orphans absente : audit orphelin conservé)");
}
const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_logs`);
const shops = await pool.query(`SELECT count(*)::int AS n FROM shops`);
const users = await pool.query(`SELECT count(*)::int AS n FROM users`);
console.log(`Reste en base : ${users.rows[0].n} utilisateur(s), ${shops.rows[0].n} boutique(s), ${audit.rows[0].n} ligne(s) d'audit`);
await pool.end();
