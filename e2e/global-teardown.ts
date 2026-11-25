import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { purgeTestAccounts } from "./helpers/purge-test-accounts";

/**
 * Nettoie la base APRÈS la suite E2E.
 *
 * Les tests tournent sur la même base que l'application : sans ce nettoyage,
 * chaque passage laisserait des comptes et des boutiques de démonstration
 * derrière lui (donnée fictive en production, interdite). Le même nettoyage est
 * fait avant la suite (global-setup), pour un run interrompu.
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
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default async function globalTeardown() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return;

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const result = await purgeTestAccounts(pool);
    console.log(
      `[e2e] base nettoyée : ${result.users} compte(s) de test, ${result.shops} boutique(s), ${result.attempts} tentative(s)`,
    );
  } catch (error) {
    console.error("[e2e] nettoyage final impossible", error);
  } finally {
    await pool.end();
  }
}
