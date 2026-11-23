/**
 * Test de sauvegarde/restauration SANS toucher à la base réelle.
 *
 * Principe : sauvegarde → restauration dans un schéma jetable `restore_test`
 * → comparaison du nombre de lignes par table → suppression du schéma.
 *
 * Usage : node scripts/backup-test.mjs
 */
import { Client } from "pg";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis.");
  process.exit(1);
}

const TEST_SCHEMA = "restore_test";
const client = new Client({ connectionString: url });

function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function snapshot(schema) {
  const result = await client.query(
    `select table_name as name from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE' order by table_name`,
    [schema],
  );
  const counts = {};
  for (const row of result.rows) {
    const counted = await client.query(`select count(*)::int as n from "${schema}"."${row.name}"`);
    counts[row.name] = counted.rows[0].n;
  }
  return counts;
}

async function main() {
  await client.connect();
  console.log("1. Sauvegarde…");
  const dir = await mkdtemp(join(tmpdir(), "teu-backup-"));
  const file = join(dir, "dump.sql");

  const tables = (
    await client.query(
      `select table_name as name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )
  ).rows.map((row) => row.name);

  const deps = (
    await client.query(
      `select tc.table_name as child, ccu.table_name as parent
         from information_schema.table_constraints tc
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
    )
  ).rows;

  // Parents avant enfants pour respecter les clés étrangères à la restauration.
  const pending = new Set(tables);
  const ordered = [];
  while (pending.size > 0) {
    let progressed = false;
    for (const name of [...pending]) {
      const blocked = deps.filter((d) => d.child === name && pending.has(d.parent));
      if (blocked.length === 0) {
        ordered.push(name);
        pending.delete(name);
        progressed = true;
      }
    }
    if (!progressed) {
      ordered.push(...[...pending].sort());
      break;
    }
  }

  const ddl = [];
  const dml = [];
  for (const table of tables) {
    const cols = (
      await client.query(
        `select column_name as name, data_type as type, is_nullable as nullable
           from information_schema.columns
          where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [table],
      )
    ).rows;
    ddl.push(
      `CREATE TABLE IF NOT EXISTS "${table}" (\n${cols
        .map((c) => `  "${c.name}" ${c.type}${c.nullable === "NO" ? " NOT NULL" : ""}`)
        .join(",\n")}\n);`,
    );
  }
  for (const table of ordered) {
    const cols = (
      await client.query(
        `select column_name as name, data_type as type, is_nullable as nullable
           from information_schema.columns
          where table_schema = 'public' and table_name = $1 order by ordinal_position`,
        [table],
      )
    ).rows;
    const rows = await client.query(`select * from "public"."${table}"`);
    if (rows.rows.length === 0) continue;
    const namesList = cols.map((c) => `"${c.name}"`).join(", ");
    for (let i = 0; i < rows.rows.length; i += 500) {
      const batch = rows.rows.slice(i, i + 500);
      dml.push(
        `INSERT INTO "${table}" (${namesList}) VALUES\n${batch
          .map((row) => `(${cols.map((c) => literal(row[c.name])).join(", ")})`)
          .join(",\n")};`,
      );
    }
  }
  const sql = ["BEGIN;", ...ddl, "-- === DONNÉES ===", ...dml, "COMMIT;"].join("\n");

  await writeFile(file, gzipSync(Buffer.from(sql, "utf8")));
  const checksum = createHash("sha256").update(await readFile(file)).digest("hex");
  console.log(`   ${tables.length} tables · ${sql.length} caractères · SHA-256 ${checksum.slice(0, 16)}…`);

  console.log("2. Restauration dans le schéma jetable…");
  await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);

  const marker = "-- === DONNÉES ===";
  const dumped = gunzipSync(await readFile(file)).toString("utf8");
  const ddlSql = dumped.split(marker)[0];
  const dmlSql = (dumped.split(marker)[1] ?? "").replace(/COMMIT;\s*$/s, "");

  await client.query("BEGIN");
  await client.query(`SET LOCAL search_path TO "${TEST_SCHEMA}"`);
  await client.query(ddlSql);
  await client.query(dmlSql);
  await client.query("COMMIT");

  console.log("3. Comparaison…");
  const before = await snapshot("public");
  const after = await snapshot(TEST_SCHEMA);

  let ok = true;
  for (const table of tables) {
    const match = before[table] === after[table];
    if (!match) ok = false;
    console.log(`   ${match ? "✅" : "❌"} ${table} : ${before[table]} → ${after[table]}`);
  }

  await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await rm(dir, { recursive: true, force: true });

  console.log(ok ? "\n=== RÉSULTAT : SAUVEGARDE/RESTAURATION OK ===" : "\n=== RÉSULTAT : ÉCHEC ===");
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("ÉCHEC :", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => client.end());
