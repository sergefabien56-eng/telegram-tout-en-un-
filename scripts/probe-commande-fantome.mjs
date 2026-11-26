/**
 * Sonde ciblée : quelle est la VRAIE situation d'une commande affichée
 * « en attente » dans l'application ?
 *
 * Lecture seule. La commande est relue directement chez Jumia sur la fenêtre
 * maximale permise par l'API (90 jours), puis comparée à ce que l'application
 * a en base.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.env.JUMIA_API_BASE ?? "https://vendor-api.jumia.com").replace(/\/$/, "");
const CIBLE = (process.env.PROBE_ORDER_ID ?? "").toLowerCase();

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

/** Extrait la liste de commandes d'une réponse Jumia, quelle que soit sa forme. */
function extractOrders(body) {
  if (!body || typeof body !== "object") return [];
  const candidates = [
    body.orders,
    body.data?.orders,
    body.data,
    body.items,
    body.results,
    body.content,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
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

  const fin = new Date();
  const debut = new Date(fin.getTime() - 89 * 86400000);
  const jour = (d) => d.toISOString().slice(0, 10);

  for (const row of rows.rows) {
    const plain = decryptText(row.refresh_token_ciphertext, secret);
    if (!plain) continue;
    const creds = JSON.parse(plain);
    const token = await accessToken(creds.clientId, creds.refreshToken);
    const access = token.access_token;

    console.log(`\n=== ${row.shop} (${row.label}) ===`);

    let page = 0;
    let total = 0;
    let trouve = null;
    const statuts = new Map();

    // Fenêtre maximale : 90 jours, comme le permet l'API Jumia.
    while (page < 12) {
      const r = await get("/orders", access, {
        shopIds: row.remote_shop_id,
        createdAfter: jour(debut),
        createdBefore: jour(fin),
        size: 100,
        page,
        sort: "DESC",
      });
      const orders = extractOrders(r.body);
      if (r.status !== 200) {
        console.log(`  page ${page} -> HTTP ${r.status} : ${JSON.stringify(r.body).slice(0, 200)}`);
        break;
      }
      total += orders.length;
      for (const o of orders) {
        const st = o.status ?? "(sans statut)";
        statuts.set(st, (statuts.get(st) ?? 0) + 1);
        if (String(o.id ?? "").toLowerCase() === CIBLE || String(o.number ?? "") === CIBLE) {
          trouve = o;
        }
      }
      if (orders.length < 100) break;
      page += 1;
    }

    console.log(`  commandes lues (90 j) : ${total}`);
    console.log(
      `  statuts : ${[...statuts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
    if (trouve) {
      console.log("  >>> COMMANDE CIBLE TROUVEE CHEZ JUMIA :");
      console.log(
        `      numero=${trouve.number} status="${trouve.status}" items=${trouve.totalItems} packed=${trouve.packedItems}`,
      );
      console.log(`      createdAt=${trouve.createdAt} updatedAt=${trouve.updatedAt}`);
      console.log(`      multipleStatus=${trouve.hasMultipleStatus} shipped=${trouve.shipped}`);
      console.log(`      raw=${JSON.stringify(trouve).slice(0, 700)}`);
    } else {
      console.log("  >>> COMMANDE CIBLE ABSENTE de la relecture Jumia (90 jours)");
    }
  }

  await db.end();
}

main().catch((e) => {
  console.error("ECHEC :", e.message);
  process.exit(1);
});
