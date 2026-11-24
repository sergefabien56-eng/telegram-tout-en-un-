/**
 * Sauvegarde de la base (0 dépendance binaire : `pg_dump` n'est pas toujours
 * disponible sur l'hébergeur gratuit). Génère un fichier SQL horodaté avec :
 *   - le DDL recréé depuis information_schema (tables, colonnes, clés) ;
 *   - les données en INSERT (échappement SQL correct) ;
 *   - un en-tête de vérification + un checksum SHA-256.
 *
 * Usage :
 *   node scripts/backup.mjs                 # écrit backups/backup-AAAA-MMJJ-HHMMSS.sql
 *   node scripts/backup.mjs --compress      # écrit en .sql.gz
 *
 * La restauration : `node scripts/restore.mjs backups/backup-….sql`.
 * Les fichiers de sauvegarde ne doivent JAMAIS être commités (.gitignore).
 */
import { Client } from "pg";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis.");
  process.exit(1);
}

const compress = process.argv.includes("--compress");
const outDir = process.env.BACKUP_DIR ?? "backups";
const schema = process.env.BACKUP_SCHEMA ?? "public";

const client = new Client({ connectionString: url });

/** Échappe une valeur pour SQL (NULL, booléen, nombre, texte, date, jsonb…). */
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "object") {
    // jsonb / json / tableaux
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function tables() {
  const result = await client.query(
    `select table_name as name
       from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE'
      order by table_name`,
    [schema],
  );
  return result.rows.map((row) => row.name);
}

async function columns(table) {
  const result = await client.query(
    `select column_name as name, data_type as type, is_nullable as nullable
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schema, table],
  );
  return result.rows;
}

async function primaryKey(table) {
  const result = await client.query(
    `select a.attname as name
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ($1 || '.' || $2)::regclass and i.indisprimary
      order by a.attnum`,
    [schema, table],
  );
  return result.rows.map((row) => row.name);
}

/** Relations de clé étrangère (enfant → parent). */
async function dependencies() {
  const result = await client.query(
    `select tc.table_name as child, ccu.table_name as parent
       from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
        and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1`,
    [schema],
  );
  return result.rows;
}

/** Ordonne les tables pour que les parents soient insérés avant les enfants. */
function orderByDependencies(names, deps) {
  const pending = new Set(names);
  const ordered = [];
  const parentsOf = new Map();
  for (const dep of deps) {
    if (!parentsOf.has(dep.child)) parentsOf.set(dep.child, new Set());
    parentsOf.get(dep.child).add(dep.parent);
  }
  while (pending.size > 0) {
    let progressed = false;
    for (const name of [...pending]) {
      const blockedBy = [...(parentsOf.get(name) ?? [])].filter((parent) => pending.has(parent));
      if (blockedBy.length === 0) {
        ordered.push(name);
        pending.delete(name);
        progressed = true;
      }
    }
    if (!progressed) {
      // Cycle (ou self-reference) : on termine par ordre alphabétique.
      ordered.push(...[...pending].sort());
      break;
    }
  }
  return ordered;
}

function ddlFor(table, cols, pk) {
  const lines = cols.map((col) => {
    const nullable = col.nullable === "NO" ? " NOT NULL" : "";
    return `  "${col.name}" ${col.type}${nullable}`;
  });
  const pkLine = pk.length > 0 ? `,\n  PRIMARY KEY (${pk.map((c) => `"${c}"`).join(", ")})` : "";
  return `CREATE TABLE IF NOT EXISTS "${table}" (\n${lines.join(",\n")}${pkLine}\n);`;
}

async function main() {
  await client.connect();
  const names = await tables();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = `${outDir}/backup-${stamp}.sql${compress ? ".gz" : ""}`;

  const header = [
    `-- TOUT EN UN — sauvegarde`,
    `-- générée le ${new Date().toISOString()}`,
    `-- schéma : ${schema} · tables : ${names.length}`,
    `-- restauration : node scripts/restore.mjs ${basename(file)}`,
    ``,
    `BEGIN;`,
    `SET statement_timeout = 0;`,
  ];
  const ddl = [];
  const dml = [];
  const counts = [];
  const ordered = orderByDependencies(names, await dependencies());

  for (const table of names) {
    const cols = await columns(table);
    const pk = await primaryKey(table);
    ddl.push(`-- === ${table} ===`, ddlFor(table, cols, pk));
  }

  for (const table of ordered) {
    const cols = await columns(table);
    const rows = await client.query(`select * from "${schema}"."${table}"`);
    counts.push(`${table}: ${rows.rows.length} ligne(s)`);
    if (rows.rows.length === 0) continue;

    const namesList = cols.map((col) => `"${col.name}"`).join(", ");
    const batchSize = 500;
    for (let i = 0; i < rows.rows.length; i += batchSize) {
      const batch = rows.rows.slice(i, i + batchSize);
      const values = batch
        .map((row) => `(${cols.map((col) => literal(row[col.name])).join(", ")})`)
        .join(",\n");
      dml.push(`INSERT INTO "${table}" (${namesList}) VALUES\n${values};`);
    }
  }

  const parts = [...header, ...ddl, `-- === DONNÉES ===`, ...dml, `COMMIT;`];

  const sql = parts.join("\n") + "\n";
  const payload = compress ? gzipSync(Buffer.from(sql, "utf8")) : Buffer.from(sql, "utf8");
  const checksum = createHash("sha256").update(payload).digest("hex");

  await mkdir(outDir, { recursive: true });
  await writeFile(file, payload);

  console.log(`✅ Sauvegarde : ${file}`);
  console.log(`   ${names.length} tables · ${counts.join(" · ")}`);
  console.log(`   SHA-256 : ${checksum}`);
  console.log(`   Restauration : node scripts/restore.mjs ${basename(file)}`);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("ÉCHEC :", message);
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|connection terminated/i.test(message)) {
      console.error(
        "Indice : la base ne répond pas — DNS, pare-feu ou hôte injoignable depuis cet environnement.",
      );
    }
    if (/authentication failed|password|no password supplied/i.test(message)) {
      console.error("Indice : identifiants refusés — vérifier le mot de passe dans DATABASE_URL.");
    }
    process.exit(1);
  })
  .finally(() => client.end());
