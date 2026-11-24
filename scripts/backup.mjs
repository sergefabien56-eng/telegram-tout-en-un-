/**
 * Sauvegarde de la base en ligne de commande.
 *
 * Le contenu du dump est construit par `scripts/lib/dump-sql.mjs`, partagé avec
 * l'export en ligne (`GET /api/admin/backup`) : un seul format, une seule vérité.
 *
 * Usage :
 *   node scripts/backup.mjs                 # écrit backups/backup-AAAA-MMJJ-HHMMSS.sql
 *   node scripts/backup.mjs --compress      # écrit en .sql.gz
 *   node scripts/backup.mjs --stdout        # affiche sur la sortie standard
 *
 * La restauration : `node scripts/restore.mjs backups/backup-….sql`.
 * Les fichiers de sauvegarde ne doivent JAMAIS être commités (.gitignore).
 */
import { Client } from "pg";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { buildSqlDump } from "./lib/dump-sql.mjs";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis.");
  process.exit(1);
}

/** Affiche la forme de l'URL (jamais le mot de passe) pour diagnostiquer. */
function describeUrl(raw) {
  try {
    const parsed = new URL(raw);
    console.log(
      `URL : protocole=${parsed.protocol} | hôte=${parsed.hostname} | port=${
        parsed.port || "(défaut)"
      } | base=${parsed.pathname} | utilisateur=${parsed.username || "(aucun)"} | mot de passe=${
        parsed.password ? "présent" : "ABSENT"
      } | paramètres=${parsed.searchParams.toString() || "(aucun)"}`,
    );
  } catch {
    console.log("URL : valeur non analysable (la chaîne de connexion est mal formée).");
  }
}
describeUrl(url);

const compress = process.argv.includes("--compress");
const toStdout = process.argv.includes("--stdout");
const outDir = process.env.BACKUP_DIR ?? "backups";
const schema = process.env.BACKUP_SCHEMA ?? "public";

const client = new Client({ connectionString: url });

try {
  await client.connect();
  const dump = await buildSqlDump(client, { schema });
  const payload = compress
    ? gzipSync(Buffer.from(dump.sql, "utf8"))
    : Buffer.from(dump.sql, "utf8");
  const checksum = createHash("sha256").update(payload).digest("hex");

  if (toStdout) {
    process.stdout.write(payload);
  } else {
    const file = `${outDir}/backup-${dump.stamp}.sql${compress ? ".gz" : ""}`;
    await mkdir(outDir, { recursive: true });
    await writeFile(file, payload);
    console.log(`✅ Sauvegarde : ${file}`);
    console.log(`   Restauration : node scripts/restore.mjs ${basename(file)}`);
  }

  console.log(`   ${dump.tableCount} tables · ${dump.counts.join(" · ")}`);
  console.log(`   SHA-256 : ${checksum}`);
} catch (error) {
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
  process.exitCode = 1;
} finally {
  await client.end();
}
