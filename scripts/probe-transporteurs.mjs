/**
 * Sonde ciblée : quels transporteurs Jumia propose **réellement** pour un
 * article (`GET /orders/shipment-providers`) ?
 *
 * Lecture seule : aucun appel d'écriture (`pack`, `ready-to-ship`) n'est
 * effectué. La sonde sert à vérifier que le format de réponse réel
 * correspond à celui que le module « préparation » attend.
 *
 * Usage : node --env-file=.env.local scripts/probe-transporteurs.mjs [articleId]
 */
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.env.JUMIA_API_BASE ?? "https://vendor-api.jumia.com").replace(/\/$/, "");
const CIBLE = (process.argv[2] ?? "").toLowerCase();

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

function resolveKey(secret) {
  const trimmed = secret.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) return buf;
  return createHash("sha256").update(trimmed).digest();
}

function decryptText(payload, secret) {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      resolveKey(secret),
      Buffer.from(parts[1], "base64"),
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function accessToken(clientId, refreshToken) {
  const response = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`token: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.ENCRYPTION_KEY;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const sql = CIBLE
    ? `SELECT a.client_id, a.refresh_token_ciphertext, s.remote_shop_id, s.name AS shop
         FROM jumia_accounts a JOIN shops s ON s.jumia_account_id = a.id
        WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.external_item_id = $1)`
    : `SELECT a.client_id, a.refresh_token_ciphertext, s.remote_shop_id, s.name AS shop
         FROM jumia_accounts a JOIN shops s ON s.jumia_account_id = a.id
        WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.external_item_id = $1)`;
  const shop = await db.query(sql, [CIBLE]);
  if (shop.rowCount === 0) {
    console.log("Article introuvable en base");
    await db.end();
    return;
  }
  const row = shop.rows[0];
  const creds = JSON.parse(decryptText(row.refresh_token_ciphertext, secret) ?? "null");
  const token = await accessToken(creds.clientId, creds.refreshToken);

  const urlProviders = new URL(`${BASE}/orders/shipment-providers`);
  urlProviders.searchParams.set("orderItemId", CIBLE);
  const response = await fetch(urlProviders, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
  });
  const text = await response.text();
  console.log(`HTTP ${response.status} — ${urlProviders.toString()}`);
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 800);
  }
  console.log(JSON.stringify(body, null, 1).slice(0, 2500));

  await db.end();
}

main().catch((e) => {
  console.error("ECHEC :", e.message);
  process.exit(1);
});
