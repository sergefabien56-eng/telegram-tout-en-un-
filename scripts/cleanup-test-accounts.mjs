/** Supprime les comptes de test (smokes) de la base. Usage : node scripts/cleanup-test-accounts.mjs */
import { Pool } from "pg";
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const patterns = ["2fa%@exemple.ci", "dbg%@exemple.ci", "smoke%@exemple.ci", "%test%", "%example.ci"];
const res = await pool.query(
  `DELETE FROM users WHERE email LIKE ANY($1::text[]) RETURNING id, email`,
  [patterns],
);
console.log(`Comptes supprimés : ${res.rowCount}`);
for (const row of res.rows) console.log(`  - ${row.email} (${row.id})`);
const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_logs`);
const shops = await pool.query(`SELECT count(*)::int AS n FROM shops`);
const users = await pool.query(`SELECT count(*)::int AS n FROM users`);
console.log(`Reste en base : ${users.rows[0].n} utilisateur(s), ${shops.rows[0].n} boutique(s), ${audit.rows[0].n} ligne(s) d'audit`);
await pool.end();
