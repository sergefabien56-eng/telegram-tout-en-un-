/**
 * Sonde ciblée : que répond Jumia à `POST /orders/print-labels` ?
 *
 * La sonde est **dirigée par un article** : `PROBE_ITEM_ID`. Elle sert à
 * vérifier la règle réelle de l'API — la documentation exige des articles
 * « not Packed (Without the trackingNumber associated) », donc des articles
 * encore en attente d'expédition.
 *
 * Attention : un appel accepté **crée le colis chez Jumia** (il attribue un
 * numéro de suivi et renvoie le PDF). Sur un article déjà emballé, l'appel
 * est refusé par Jumia et n'a aucun effet.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.env.JUMIA_API_BASE ?? "https://vendor-api.jumia.com").replace(/\/$/, "");
const CIBLE = (process.env.PROBE_ITEM_ID ?? "").toLowerCase();

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
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

  const shop = await db.query(
    `SELECT a.client_id, a.refresh_token_ciphertext, s.remote_shop_id, s.name AS shop,
            oi.status AS item_status, oi.tracking_number
       FROM jumia_accounts a
       JOIN shops s ON s.jumia_account_id = a.id
       JOIN order_items oi ON oi.shop_id = s.id
       JOIN orders o ON o.id = oi.order_id
      WHERE lower(oi.external_item_id) = $1
      LIMIT 1`,
    [CIBLE],
  );
  if (shop.rowCount === 0) {
    console.log("Article introuvable en base");
    await db.end();
    return;
  }
  const row = shop.rows[0];
  console.log(`Boutique : ${row.shop} | article ${CIBLE}`);
  console.log(`État local : ${row.item_status} | suivi ${row.tracking_number ?? "(aucun)"}`);

  const creds = JSON.parse(decryptText(row.refresh_token_ciphertext, secret) ?? "null");
  const token = await accessToken(creds.clientId, creds.refreshToken);

  const response = await fetch(`${BASE}/orders/print-labels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ orderItemIds: [CIBLE] }),
  });
  const text = await response.text();
  console.log(`\nPOST /orders/print-labels → HTTP ${response.status}`);
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 900);
  }
  const resume = {
    success: body?.success
      ? {
          total: body.success.total,
          labels: (body.success.labels ?? []).map((l) => ({
            orderItemIds: l.orderItemIds,
            countryCode: l.countryCode,
            trackingNumber: l.trackingNumber,
            pdf: typeof l.label === "string" ? `${l.label.length} caractères base64` : null,
          })),
        }
      : undefined,
    error: body?.error,
  };
  console.log(JSON.stringify(resume, null, 1));

  await db.end();
}

main().catch((e) => {
  console.error("ECHEC :", e.message);
  process.exit(1);
});
