/**
 * Sonde la documentation réelle de l'API Jumia Vendor Center (GPM).
 *
 * Objectif : connaître les **formes exactes** des réponses (catégories,
 * ensembles d'attributs, marques) avant d'écrire le code, sans rien inventer.
 * Aucune écriture n'est faite : uniquement des lectures (GET).
 *
 * Usage : node scripts/probe-jumia-referentiel.mjs
 */
import { createDecipheriv, createHash } from "node:crypto";
import { Pool } from "pg";

const BASE = (process.env.JUMIA_API_BASE ?? "https://vendor-api.jumia.com").replace(/\/$/, "");

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
    const key = resolveKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
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
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  });
  const response = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`token: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function get(path, token, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 600);
  }
  return { status: response.status, body };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const { rows } = await pool.query(
  "select id, label, client_id, refresh_token_ciphertext from jumia_accounts order by created_at",
);
await pool.end();

const secret = process.env.ENCRYPTION_KEY;
for (const account of rows) {
  const plain = decryptText(account.refresh_token_ciphertext, secret);
  if (!plain) {
    console.log(`\n### ${account.label} : identifiants illisibles`);
    continue;
  }
  const credentials = JSON.parse(plain);
  const token = await accessToken(credentials.clientId, credentials.refreshToken);
  console.log(`\n### ${account.label} — token obtenu (expires_in=${token.expires_in})`);

  const shops = await get("/shops", token.access_token);
  const shopId = Array.isArray(shops.body) ? shops.body[0]?.id : shops.body?.shops?.[0]?.id;
  console.log(`boutique : ${shopId} (HTTP ${shops.status})`);

  const brands = await get("/catalog/brands", token.access_token, { size: 100 });
  console.log("\n--- brands page info ---", JSON.stringify(brands.body?.page ?? null));

  const cat = await get("/catalog/categories", token.access_token, { size: 1 });
  const setSid = cat.body?.categories?.[0]?.attributeSet?.sid;
  console.log("\n--- /shops brut (businessClients) ---");
  console.log(JSON.stringify(shops.body, null, 1).slice(0, 1500));

  const catalogue = await get("/catalog/products", token.access_token, { size: 1 });
  console.log("\n--- /catalog/products (1) ---");
  console.log(JSON.stringify(catalogue.body, null, 1).slice(0, 2500));

  for (const [label, path, params] of [
    ["attribute-set (détail)", `/catalog/attribute-sets/${setSid}`, {}],
    ["categories (enfant)", "/catalog/categories", { size: 2, parent: 1000002 }],
    ["categories (recherche par nom)", "/catalog/categories", { size: 2, name: "Beauty" }],
  ]) {
    const result = await get(path, token.access_token, params);
    console.log(`\n--- ${label} → HTTP ${result.status}`);
    console.log(JSON.stringify(result.body, null, 1).slice(0, 2200));
  }
}
