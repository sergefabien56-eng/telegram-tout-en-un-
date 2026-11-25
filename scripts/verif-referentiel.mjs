/**
 * Contrôle de l'état du référentiel tel que l'application le voit.
 * Session temporaire (propriétaire), supprimée à la fin.
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

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const user = await db.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
    "fabienserge77@gmail.com",
  ]);
  const token = randomUUID() + randomUUID();
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + interval '10 minutes', '127.0.0.1', 'scripts/verif-referentiel.mjs')",
    [user.rows[0].id, sha256Hex(token)],
  );
  try {
    for (const shopId of process.argv.slice(2)) {
      const started = Date.now();
      const response = await fetch(
        `${APP_URL}/api/shops/${shopId}/catalogue/referentiel?type=categories`,
        { headers: { Cookie: `teu_session=${token}` } },
      );
      const body = await response.json().catch(() => null);
      console.log(`${shopId} → HTTP ${response.status} en ${Date.now() - started} ms`);
      console.log("  state :", JSON.stringify(body?.data?.state));
      const sample = (body?.data?.categories ?? []).slice(0, 3);
      for (const c of sample) {
        console.log(`  · ${c.code} — ${c.name} (${c.completePath ?? "—"})`);
      }
    }
  } finally {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256Hex(token)]);
    await db.end();
    console.log("session temporaire supprimée");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
