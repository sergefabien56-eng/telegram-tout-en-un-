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
/** Purge aussi les tentatives de connexion enregistrées pendant les tests. */
const withAttempts = process.argv.includes("--attempts");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

/**
 * Compte de test = adresse jetable créée par les harnais (smokes ou E2E).
 * On peut cibler un motif précis avec `--email=<fragment>`.
 */
const extra = process.argv.find((arg) => arg.startsWith("--email="))?.split("=")[1];
/**
 * Comptes **protégés** : ils ne sont jamais des comptes de test, même s'ils
 * portent une adresse `@exemple.ci`.
 *
 * Le compte de démonstration (`scripts/demo-account.mjs`) sert à montrer
 * l'application avec les vraies boutiques : le supprimer à chaque passage
 * de la suite de tests le ferait disparaître et laisserait l'utilisateur
 * sans accès. Il est donc explicitement préservé.
 */
const PROTECTED_EMAILS = ["demo-captures@exemple.ci"];
/**
 * Le domaine `@exemple.ci` est réservé (RFC 2606) et partagé par tous les
 * harnais : le motif est large pour ne laisser aucun résidu. Les comptes
 * protégés en sont exemptés.
 */
const TEST_EMAIL_RE = extra ?? ".*@exemple\\.ci$";
/** Fragment SQL : exclut les comptes protégés de la sélection. */
const nonProtege = `NOT (email = ANY($2::text[]))`;

// 1. Journal d'audit rattaché aux comptes de test (avant suppression des comptes).
const ids = await pool.query(
  `SELECT id FROM users WHERE email ~ $1 AND ${nonProtege}`,
  [TEST_EMAIL_RE, PROTECTED_EMAILS],
);
const userIds = ids.rows.map((row) => row.id);
let auditDeleted = 0;
if (userIds.length > 0) {
  const removed = await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [
    userIds,
  ]);
  auditDeleted = removed.rowCount ?? 0;
}

// 2. Boutiques détenues par ces comptes : la clé `shops.owner_user_id` est en
//    RESTRICT, il faut donc retirer d'abord les boutiques et leurs membres.
if (userIds.length > 0) {
  const members = await pool.query(`DELETE FROM shop_members WHERE user_id = ANY($1::uuid[])`, [
    userIds,
  ]);
  const owned = await pool.query(`DELETE FROM shops WHERE owner_user_id = ANY($1::uuid[])`, [
    userIds,
  ]);
  console.log(
    `Boutiques de test supprimées : ${owned.rowCount ?? 0} · membres : ${members.rowCount ?? 0}`,
  );
}

// 3. Comptes de test.
const res = await pool.query(
  `DELETE FROM users WHERE email ~ $1 AND ${nonProtege} RETURNING id, email`,
  [TEST_EMAIL_RE, PROTECTED_EMAILS],
);
console.log(`Comptes supprimés : ${res.rowCount}`);
for (const row of res.rows) console.log(`  - ${row.email} (${row.id})`);
console.log(`Lignes d'audit rattachées supprimées : ${auditDeleted}`);

// 4. Résidus de test devenus orphelins lors des passes précédentes.
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

// Les tests E2E provoquent volontairement des échecs de connexion : sans cette
// purge, le verrou anti-abus (5 échecs / 15 min par IP) bloque les tests suivants.
if (withAttempts) {
  const attempts = await pool.query(
    `DELETE FROM login_attempts
      WHERE (email ~ $1 AND ${nonProtege}) OR ip IN ('::1', '127.0.0.1')`,
    [TEST_EMAIL_RE, PROTECTED_EMAILS],
  );
  console.log(`Tentatives de connexion purgées : ${attempts.rowCount ?? 0}`);
}
const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_logs`);
const shops = await pool.query(`SELECT count(*)::int AS n FROM shops`);
const users = await pool.query(`SELECT count(*)::int AS n FROM users`);
console.log(
  `Reste en base : ${users.rows[0].n} utilisateur(s), ${shops.rows[0].n} boutique(s), ${audit.rows[0].n} ligne(s) d'audit`,
);
const proteges = await pool.query(
  `SELECT email FROM users WHERE email = ANY($1::text[])`,
  [PROTECTED_EMAILS],
);
console.log(
  `Comptes protégés conservés : ${proteges.rows.map((row) => row.email).join(", ") || "(aucun)"}`,
);
await pool.end();
