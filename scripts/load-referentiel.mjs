/**
 * Recharge le référentiel des catégories d'une boutique depuis l'API Jumia.
 *
 * Le chargement passe par la **route de l'application** (et non par un accès
 * direct à la base) : les permissions, la trace d'audit et l'écriture de
 * l'état d'avancement sont donc ceux du produit. Une session temporaire est
 * créée pour le propriétaire, puis révoquée à la fin.
 *
 * Usage : node scripts/load-referentiel.mjs <shopId> [<shopId> …]
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const APP_URL = (process.env.APP_URL ?? "https://tout-en-un-business-manager.onrender.com").replace(
  /\/$/,
  "",
);
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "fabienserge77@gmail.com";

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

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

async function main() {
  loadEnvLocal();
  const shopIds = process.argv.slice(2);
  if (shopIds.length === 0) throw new Error("Usage : node scripts/load-referentiel.mjs <shopId> …");
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante.");

  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const user = await db.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [OWNER_EMAIL]);
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error(`Propriétaire introuvable : ${OWNER_EMAIL}`);

  // Session temporaire : le jeton n'existe que dans ce processus, seule son
  // empreinte est stockée, comme dans l'application.
  const token = randomUUID() + randomUUID();
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + interval '30 minutes', '127.0.0.1', 'scripts/load-referentiel.mjs')",
    [userId, sha256Hex(token)],
  );

  try {
    for (const shopId of shopIds) {
      const shop = await db.query("SELECT name FROM shops WHERE id = $1", [shopId]);
      console.log(`\n=== boutique ${shop.rows[0]?.name ?? shopId} (${shopId})`);

      const started = await fetch(`${APP_URL}/api/shops/${shopId}/catalogue/referentiel`, {
        method: "POST",
        headers: { Cookie: `teu_session=${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const startedBody = await started.json().catch(() => null);
      console.log(
        `  déclenchement : HTTP ${started.status} — ${startedBody?.data?.message ?? startedBody?.error ?? "?"}`,
      );
      if (!started.ok) continue;

      let last = null;
      for (let attempt = 1; attempt <= 80; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const response = await fetch(
          `${APP_URL}/api/shops/${shopId}/catalogue/referentiel?type=categories`,
          { headers: { Cookie: `teu_session=${token}` } },
        );
        const body = await response.json().catch(() => null);
        const state = body?.data?.state ?? null;
        if (!state) {
          console.log(`  [${attempt}] état illisible (HTTP ${response.status})`);
          continue;
        }
        if (
          !last ||
          last.count !== state.count ||
          last.pages !== state.pages ||
          last.complete !== state.complete
        ) {
          console.log(
            `  [${attempt}] ${state.count} catégories · page ${state.pages}/${state.totalOfPages} · ${state.complete ? "terminé" : "en cours"}`,
          );
          last = state;
        }
        if (state.complete === true) break;
      }
      const stored = await db.query(
        "SELECT count(*)::int AS n FROM jumia_catalog_categories WHERE shop_id = $1",
        [shopId],
      );
      console.log(`  catégories enregistrées en base : ${stored.rows[0].n}`);
    }
  } finally {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256Hex(token)]);
    await db.end();
    console.log("\nSession temporaire supprimée.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
