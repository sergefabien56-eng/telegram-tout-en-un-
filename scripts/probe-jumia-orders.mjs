/**
 * Sonde de l'endpoint `GET /orders` de l'API Jumia Vendor Center.
 *
 * Lecture seule : aucune écriture. Le but est de connaître la **forme
 * exacte** de la requête acceptée (et le message d'erreur réel en cas de
 * refus) avant de corriger le code.
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
    body = text.slice(0, 800);
  }
  return { status: response.status, body, url: url.toString() };
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.ENCRYPTION_KEY;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const rows = await db.query(
    `SELECT a.client_id, a.refresh_token_ciphertext, a.label, s.remote_shop_id, s.name AS shop
       FROM jumia_accounts a JOIN shops s ON s.jumia_account_id = a.id
      ORDER BY a.created_at`,
  );

  for (const row of rows.rows) {
    const plain = decryptText(row.refresh_token_ciphertext, secret);
    if (!plain) {
      console.log(`${row.label} : identifiants illisibles`);
      continue;
    }
    const creds = JSON.parse(plain);
    const token = await accessToken(creds.clientId, creds.refreshToken);
    const access = token.access_token;

    const fin = new Date();
    const debut = new Date(fin.getTime() - 29 * 86400000);
    const jour = (d) => d.toISOString().slice(0, 10);
    const complet = (d) => d.toISOString();

    const variantes = [
      {
        nom: "ce que l'application envoie aujourd'hui (dates seules + size + sort)",
        params: {
          shopId: row.remote_shop_id,
          createdAfter: jour(debut),
          createdBefore: jour(fin),
          size: 200,
          sort: "DESC",
        },
      },
      {
        nom: "sans `sort`",
        params: {
          shopId: row.remote_shop_id,
          createdAfter: jour(debut),
          createdBefore: jour(fin),
          size: 200,
        },
      },
      {
        nom: "sans `size` ni `sort`",
        params: {
          shopId: row.remote_shop_id,
          createdAfter: jour(debut),
          createdBefore: jour(fin),
        },
      },
      {
        nom: "horodatages complets ISO",
        params: {
          shopId: row.remote_shop_id,
          createdAfter: complet(debut),
          createdBefore: complet(fin),
          size: 200,
          sort: "DESC",
        },
      },
      {
        nom: "avec `offset`/`limit` au lieu de `size`",
        params: {
          shopId: row.remote_shop_id,
          createdAfter: jour(debut),
          createdBefore: jour(fin),
          offset: 0,
          limit: 200,
        },
      },
      {
        nom: "sans `shopId`",
        params: {
          createdAfter: jour(debut),
          createdBefore: jour(fin),
          size: 200,
          sort: "DESC",
        },
      },
    ];

    console.log(`\n######## ${row.label} → boutique ${row.shop} (${row.remote_shop_id})`);
    for (const variante of variantes) {
      const res = await get("/orders", access, variante.params);
      const apercu =
        res.body && typeof res.body === "object"
          ? JSON.stringify(res.body).slice(0, 400)
          : String(res.body).slice(0, 400);
      console.log(`\n— ${variante.nom}`);
      console.log(`  HTTP ${res.status}  ${res.url.replace(BASE, "")}`);
      console.log(`  ${apercu}`);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  await db.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
