import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Prépare la base avant la suite E2E :
 * - purge les comptes de test restés d'un run précédent ;
 * - vide les tentatives de connexion, sinon le verrou anti-abus (5 échecs /
 *   15 min par IP) bloque les connexions des tests suivantes.
 *
 * Ignoré silencieusement si DATABASE_URL est absent (CI sans base).
 */
function loadEnvLocal() {
  const file = process.env.E2E_ENV_FILE ?? ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Les valeurs peuvent être entre guillemets (comme dans vitest.config.ts).
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default async function globalSetup() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return;

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const pattern = "(2fa|dbg|smoke|e2e|a11y|mini)[.-].*@exemple\\.ci$";
    const users = await pool.query(`DELETE FROM users WHERE email ~ $1 RETURNING id`, [pattern]);
    const attempts = await pool.query(`DELETE FROM login_attempts`);
    console.log(
      `[e2e] base préparée : ${users.rowCount ?? 0} compte(s) de test, ${attempts.rowCount ?? 0} tentative(s) purgées`,
    );
  } finally {
    await pool.end();
  }
}
