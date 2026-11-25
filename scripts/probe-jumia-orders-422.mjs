/**
 * Sonde : la fenêtre « création + mise à jour » combinée (`GET /orders`).
 *
 * C'est le chemin par défaut de l'application (`followUpdates` est activé par
 * défaut) : on relit les commandes créées dans la période **et** les
 * commandes plus anciennes modifiées depuis la dernière synchronisation.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.env.JUMIA_API_BASE ?? "https://vendor-api.jumia.com").replace(/\/$/, "");

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

async function get(path, token, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  return { status: response.status, body, url: url.toString() };
}

const jour = (d) => d.toISOString().slice(0, 10);
const decalage = (base, jours) => jour(new Date(base.getTime() + jours * 86400000));

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.ENCRYPTION_KEY;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const rows = await db.query(
    `SELECT a.client_id, a.refresh_token_ciphertext, a.label, s.remote_shop_id, s.name AS shop
       FROM jumia_accounts a JOIN shops s ON s.jumia_account_id = a.id ORDER BY a.created_at`,
  );

  const fin = new Date();
  for (const row of rows.rows) {
    const creds = JSON.parse(decryptText(row.refresh_token_ciphertext, secret));
    const access = (await accessToken(creds.clientId, creds.refreshToken)).access_token;
    console.log(`\n######## ${row.label} → ${row.shop}`);

    const cas = [
      {
        nom: "création 30 j seule (ce qui marche)",
        params: { createdAfter: decalage(fin, -29), createdBefore: jour(fin) },
      },
      {
        nom: "mise à jour 90 j seule",
        params: { updatedAfter: decalage(fin, -90), updatedBefore: jour(fin) },
      },
      {
        nom: "création 30 j + mise à jour 90 j  (followUpdates par défaut, sans sync précédente)",
        params: {
          createdAfter: decalage(fin, -29),
          createdBefore: jour(fin),
          updatedAfter: decalage(fin, -90),
          updatedBefore: jour(fin),
        },
      },
      {
        nom: "création 30 j + mise à jour 30 j",
        params: {
          createdAfter: decalage(fin, -29),
          createdBefore: jour(fin),
          updatedAfter: decalage(fin, -29),
          updatedBefore: jour(fin),
        },
      },
      {
        nom: "création 30 j + mise à jour 60 j",
        params: {
          createdAfter: decalage(fin, -29),
          createdBefore: jour(fin),
          updatedAfter: decalage(fin, -60),
          updatedBefore: jour(fin),
        },
      },
      {
        nom: "création 90 j + mise à jour 90 j",
        params: {
          createdAfter: decalage(fin, -90),
          createdBefore: jour(fin),
          updatedAfter: decalage(fin, -90),
          updatedBefore: jour(fin),
        },
      },
      {
        nom: "création 30 j + mise à jour 90 j, avec size et sort (exactement l'application)",
        params: {
          createdAfter: decalage(fin, -29),
          createdBefore: jour(fin),
          updatedAfter: decalage(fin, -90),
          updatedBefore: jour(fin),
          size: 200,
          sort: "DESC",
        },
      },
    ];

    for (const c of cas) {
      const res = await get("/orders", access, { shopId: row.remote_shop_id, ...c.params });
      const n = Array.isArray(res.body?.orders) ? res.body.orders.length : "-";
      console.log(`\n— ${c.nom}\n  HTTP ${res.status} · commandes: ${n}`);
      if (res.status !== 200) console.log(`  ${JSON.stringify(res.body).slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await db.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
