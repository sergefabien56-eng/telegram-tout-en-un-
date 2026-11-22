/**
 * Vérification de bout en bout de la base Neon.
 * Usage : node scripts/db-smoke.mjs
 * Prérequis : DATABASE_URL (poolé) ou DATABASE_URL_UNPOOLED dans l'environnement.
 *
 * - liste les tables du schéma public ;
 * - prouve une écriture dans une transaction annulée (aucune donnée laissée).
 */
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis.");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();

  const tables = await client.query(
    `select table_name::text as name
       from information_schema.tables
      where table_schema = 'public'
      order by table_name`,
  );
  const names = tables.rows.map((r) => r.name);
  console.log(`Tables (${names.length}) : ${names.join(", ") || "(aucune)"}`);

  const expected = [
    "users",
    "sessions",
    "shops",
    "shop_members",
    "audit_logs",
    "jobs",
    "notifications",
    "user_notification_prefs",
    "telegram_accounts",
    "app_settings",
    "login_attempts",
    "password_reset_tokens",
  ];
  const missing = expected.filter((t) => !names.includes(t));
  if (missing.length > 0) {
    throw new Error(`Tables manquantes : ${missing.join(", ")}`);
  }

  // Écriture prouvée puis annulée (rollback) : aucune donnée persistée.
  await client.query("begin");
  await client.query(
    `insert into app_settings (key, value, updated_at)
     values ('__smoke_test', '{}'::jsonb, now())`,
  );
  const readBack = await client.query(
    `select key::text as key from app_settings where key = '__smoke_test'`,
  );
  await client.query("rollback");

  const after = await client.query(
    `select count(*)::int as n from app_settings where key = '__smoke_test'`,
  );

  console.log(`Écriture relue avant rollback : ${readBack.rowCount} ligne(s)`);
  console.log(`Persisté après rollback : ${after.rows[0].n} ligne(s)`);

  if (readBack.rowCount !== 1 || after.rows[0].n !== 0) {
    throw new Error("Le test d'écriture/rollback a échoué.");
  }

  console.log("SMOKE OK : base accessible en lecture et écriture, transaction annulée proprement.");
} catch (error) {
  console.error("SMOKE ÉCHOUÉ :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
