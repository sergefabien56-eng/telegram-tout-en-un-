/**
 * Restaure une sauvegarde produite par `scripts/backup.mjs`.
 *
 * Usage :
 *   node scripts/restore.mjs backups/backup-XXXX.sql          # demande confirmation
 *   node scripts/restore.mjs backups/backup-XXXX.sql --yes    # sans confirmation
 *   node scripts/restore.mjs backups/backup-XXXX.sql --dry-run # valide sans écrire
 *   node scripts/restore.mjs backups/backup-XXXX.sql --schema restore_test
 *
 * ⚠️ La restauration ÉCRASE les données des tables présentes dans le dump.
 *    Les clés étrangères sont temporairement désactivées pendant l'écriture.
 */
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis.");
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const assumeYes = args.includes("--yes");
const dryRun = args.includes("--dry-run");
const schemaFlag = args.indexOf("--schema");

if (!file) {
  console.error("Usage : node scripts/restore.mjs <fichier.sql[.gz]> [--yes] [--dry-run] [--schema nom]");
  process.exit(1);
}

const schema = schemaFlag !== -1 ? args[schemaFlag + 1] : "public";
const buffer = await readFile(file);
const isGzip = file.endsWith(".gz");
const sql = (isGzip ? gunzipSync(buffer) : buffer).toString("utf8");

if (!sql.includes("TOUT EN UN — sauvegarde")) {
  console.error("Ce fichier ne ressemble pas à une sauvegarde TOUT EN UN.");
  process.exit(1);
}

const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g)].map((m) => m[1]);
const inserts = (sql.match(/^INSERT INTO "/gm) ?? []).length;

console.log(`Fichier   : ${basename(file)}${isGzip ? " (gz)" : ""}`);
console.log(`Schéma    : ${schema}`);
console.log(`Tables    : ${tables.length}`);
console.log(`INSERT    : ${inserts}`);

if (dryRun) {
  console.log("Mode dry-run : aucune écriture.");
  process.exit(0);
}

if (!assumeYes) {
  console.error("\n⚠️  La restauration remplace les données des tables listées ci-dessus.");
  console.error("    Relance avec --yes pour confirmer.");
  process.exit(2);
}

const client = new Client({ connectionString: url });
await client.connect();

try {
  // Le dump contenant DDL puis données, on les exécute en deux temps pour
  // pouvoir désactiver les triggers (clés étrangères) pendant l'écriture.
  const marker = "-- === DONNÉES ===";
  const ddl = sql.split(marker)[0];
  const dml = (sql.split(marker)[1] ?? "").replace(/COMMIT;\s*$/s, "");

  await client.query("BEGIN");
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(ddl);
  // Le DML est déjà ordonné parents → enfants (voir backup.mjs), les
  // contraintes de clé étrangère sont donc respectées pendant l'écriture.
  await client.query(dml);

  await client.query("COMMIT");
  console.log(`✅ Restauration terminée sur le schéma "${schema}".`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("❌ Restauration annulée (rollback) :", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}
