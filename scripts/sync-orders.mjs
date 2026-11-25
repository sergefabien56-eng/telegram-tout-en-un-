/**
 * Lance une synchronisation réelle des commandes, par la route de
 * l'application (permissions, audit, garde-fou de verrou).
 *
 * Session temporaire pour le propriétaire, supprimée à la fin.
 *
 * Usage : node scripts/sync-orders.mjs <shopId> [<shopId> …] [jours]
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const APP_URL = (process.env.APP_URL ?? "https://tout-en-un-business-manager.onrender.com").replace(
  /\/$/,
  "",
);

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
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

const sha256Hex = (v) => createHash("sha256").update(v).digest("hex");
const jour = (d) => d.toISOString().slice(0, 10);

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const jours = Number(args[args.length - 1]);
  const shopIds = Number.isFinite(jours) ? args.slice(0, -1) : args;
  const span = Number.isFinite(jours) ? jours : 29;
  if (shopIds.length === 0) {
    throw new Error("Usage : node scripts/sync-orders.mjs <shopId> [<shopId> …] [jours]");
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const user = await db.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
    "fabienserge77@gmail.com",
  ]);
  const token = randomUUID() + randomUUID();
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + interval '30 minutes', '127.0.0.1', 'scripts/sync-orders.mjs')",
    [user.rows[0].id, sha256Hex(token)],
  );

  try {
    const fin = new Date();
    const debut = new Date(fin.getTime() - span * 86400000);
    for (const shopId of shopIds) {
      const shop = await db.query("SELECT name FROM shops WHERE id = $1", [shopId]);
      console.log(`\n=== ${shop.rows[0]?.name ?? shopId} · ${jour(debut)} → ${jour(fin)}`);
      const started = Date.now();
      const response = await fetch(`${APP_URL}/api/shops/${shopId}/commandes/sync`, {
        method: "POST",
        headers: {
          Cookie: `teu_session=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: jour(debut),
          to: jour(fin),
          // La case « relire aussi les commandes plus anciennes » est
          // activée par défaut dans l'interface : on la teste telle quelle.
          followUpdates: true,
        }),
      });
      const body = await response.json().catch(() => null);
      console.log(`  HTTP ${response.status} en ${Math.round((Date.now() - started) / 1000)} s`);
      console.log(`  ${JSON.stringify(body?.data ?? body?.error ?? body).slice(0, 600)}`);

      const compte = await db.query("SELECT count(*)::int AS n FROM orders WHERE shop_id = $1", [
        shopId,
      ]);
      const etat = await db.query(
        "SELECT last_sync_at, last_sync_status FROM shops WHERE id = $1",
        [shopId],
      );
      console.log(`  commandes en base : ${compte.rows[0].n}`);
      console.log(`  état : ${JSON.stringify(etat.rows[0])}`);
    }
  } finally {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256Hex(token)]);
    await db.end();
    console.log("\nsession temporaire supprimée");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
