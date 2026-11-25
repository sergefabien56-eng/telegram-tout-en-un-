/**
 * Sonde de la **pagination** de `GET /orders` (API Jumia Vendor Center).
 *
 * Lecture seule. Objectif : connaître les clés réellement renvoyées et le
 * comportement de l'API quand on lui passe un `token` de continuation.
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
    body = text.slice(0, 500);
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
       FROM jumia_accounts a JOIN shops s ON s.jumia_account_id = a.id ORDER BY a.created_at`,
  );

  for (const row of rows.rows) {
    const creds = JSON.parse(decryptText(row.refresh_token_ciphertext, secret));
    const access = (await accessToken(creds.clientId, creds.refreshToken)).access_token;
    const fin = new Date();
    const debut = new Date(fin.getTime() - 29 * 86400000);
    const jour = (d) => d.toISOString().slice(0, 10);

    console.log(`\n######## ${row.label} → ${row.shop}`);

    // 1. La réponse contient-elle `nextToken` / `isLastPage` ?
    const base = {
      shopId: row.remote_shop_id,
      createdAfter: jour(debut),
      createdBefore: jour(fin),
      size: 200,
      sort: "DESC",
    };
    const premiere = await get("/orders", access, base);
    console.log(`\n— première page : HTTP ${premiere.status}`);
    if (premiere.body && typeof premiere.body === "object") {
      console.log("  clés de la réponse :", Object.keys(premiere.body).join(", "));
      console.log(
        "  orders:",
        Array.isArray(premiere.body.orders) ? premiere.body.orders.length : "(absent)",
      );
      console.log("  isLastPage :", JSON.stringify(premiere.body.isLastPage));
      console.log("  nextToken :", JSON.stringify(premiere.body.nextToken));
      console.log("  isLastPagePresent ?", "isLastPage" in premiere.body);
    }
    await new Promise((r) => setTimeout(r, 1200));

    // 2. Reprise avec le `token` que l'application utilise.
    const token = premiere.body?.nextToken;
    if (typeof token === "string" && token) {
      const avecToken = await get("/orders", access, { ...base, token });
      console.log(`\n— reprise avec nextToken : HTTP ${avecToken.status}`);
      console.log("  ", JSON.stringify(avecToken.body).slice(0, 300));
      await new Promise((r) => setTimeout(r, 1200));
    } else {
      console.log(
        "\n— pas de nextToken dans la réponse : la pagination par token n'a rien à tester",
      );
    }

    // 3. Un `token` factice (ce que ferait l'app si la réponse n'en avait pas).
    const factice = await get("/orders", access, { ...base, token: "0" });
    console.log(`\n— avec un token factice : HTTP ${factice.status}`);
    console.log("  ", JSON.stringify(factice.body).slice(0, 300));
    await new Promise((r) => setTimeout(r, 1200));

    // 4. Fenêtre de mise à jour (chemin « relire les changements »).
    const maj = await get("/orders", access, {
      shopId: row.remote_shop_id,
      updatedAfter: jour(debut),
      updatedBefore: jour(fin),
      size: 200,
      sort: "DESC",
    });
    console.log(
      `\n— fenêtre de mise à jour seule (updatedAfter/updatedBefore) : HTTP ${maj.status}`,
    );
    console.log("  ", JSON.stringify(maj.body).slice(0, 300));
    await new Promise((r) => setTimeout(r, 1200));

    // 5. Sans aucune borne de date.
    const sansDate = await get("/orders", access, { shopId: row.remote_shop_id, size: 200 });
    console.log(`\n— sans aucune date : HTTP ${sansDate.status}`);
    console.log("  ", JSON.stringify(sansDate.body).slice(0, 300));
  }

  await db.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
