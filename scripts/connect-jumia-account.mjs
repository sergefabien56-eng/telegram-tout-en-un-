/**
 * Connexion / mise à jour d'un compte vendeur Jumia (Self Authorization).
 *
 * Principes :
 * - le refresh token n'est jamais affiché : seul son SHA-256 (préfixe) est
 *   journalisé, pour prouver quel jeton est stocké ;
 * - l'échange `POST /token` fait pivoter le refresh token : le jeton
 *   retourné est **immédiatement** réécrit chiffré (AES-256-GCM, format
 *   `v1:iv:tag:data`), sinon le jeton deviendrait inutilisable ;
 * - aucune écriture de produit : uniquement de l'authentification et des
 *   lectures (GET /shops).
 *
 * Usage : JUMIA_CLIENT_ID=… JUMIA_REFRESH_TOKEN=… node /tmp/connect-jumia-account.mjs
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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

function encryptText(plainText, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

/** Empreinte d'un jeton : prouve lequel est stocké sans jamais le montrer. */
function empreinte(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function echanger(clientId, refreshToken) {
  const response = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

async function lireShops(accessToken) {
  const response = await fetch(`${BASE}/shops`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.ENCRYPTION_KEY;
  const clientId = process.env.JUMIA_CLIENT_ID?.trim();
  const refreshToken = process.env.JUMIA_REFRESH_TOKEN?.trim();
  if (!url) throw new Error("DATABASE_URL manquante.");
  if (!secret) throw new Error("ENCRYPTION_KEY manquante.");
  if (!clientId || !refreshToken) throw new Error("Identifiants fournis manquants.");

  console.log(`client_id fourni : ${clientId}`);
  console.log(`empreinte du refresh token fourni : ${empreinte(refreshToken)}`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const accounts = await client.query(
      "SELECT id, label, email, client_id, refresh_token_ciphertext, status FROM jumia_accounts WHERE client_id = $1",
      [clientId],
    );
    if (accounts.rowCount === 0) {
      console.log("Aucun compte enregistré avec ce client_id : rien à mettre à jour.");
      return;
    }
    if (accounts.rowCount > 1) {
      console.log(`ATTENTION : ${accounts.rowCount} comptes portent ce client_id.`);
    }
    const account = accounts.rows[0];

    const plain = decryptText(account.refresh_token_ciphertext, secret);
    let stored = null;
    if (plain) {
      try {
        const parsed = JSON.parse(plain);
        stored = parsed.refreshToken ?? plain;
      } catch {
        stored = plain;
      }
    }
    console.log(
      `compte en base     : ${account.label} (${account.email ?? "sans e-mail"}) — ${account.id}`,
    );
    console.log(`statut en base     : ${account.status}`);
    console.log(
      stored
        ? `empreinte du jeton stocké : ${empreinte(stored)}`
        : "jeton stocké : illisible (ENCRYPTION_KEY différente ?)",
    );
    if (stored) {
      console.log(
        stored === refreshToken
          ? "→ le jeton fourni est celui déjà stocké."
          : "→ le jeton fourni_diffère du jeton stocké.",
      );
    }

    // Échange : c'est lui qui prouve que les identifiants sont valides.
    const echange = await echanger(clientId, refreshToken);
    if (!echange.ok) {
      console.log(
        `ÉCHANGE REFUSÉ par Jumia (HTTP ${echange.status}) : ${JSON.stringify(echange.body)}`,
      );
      console.log("La base n'a pas été modifiée.");
      return;
    }
    const accessToken = echange.body?.access_token;
    const rotated = echange.body?.refresh_token;
    console.log(
      `ÉCHANGE ACCEPTÉ : expires_in=${echange.body?.expires_in}s, refresh_expires_in=${echange.body?.refresh_expires_in ?? "?"}s`,
    );
    console.log(
      rotated
        ? `jeton pivoté reçu : oui (empreinte ${empreinte(rotated)})`
        : "jeton pivoté reçu : non (l'ancien reste valable)",
    );

    // Le jeton stocké doit être celui qui reste valable : le pivoté s'il y en a un.
    const aStocker = typeof rotated === "string" && rotated ? rotated : refreshToken;
    const ciphertext = encryptText(JSON.stringify({ clientId, refreshToken: aStocker }), secret);
    await client.query(
      "UPDATE jumia_accounts SET refresh_token_ciphertext = $2, status = 'active', last_token_at = now(), updated_at = now() WHERE id = $1",
      [account.id, ciphertext],
    );
    console.log(`jeton stocké (chiffré) : empreinte ${empreinte(aStocker)}`);

    const shops = await lireShops(accessToken);
    console.log(`lecture des boutiques : HTTP ${shops.status}`);
    // L'API renvoie soit un tableau brut, soit `{ shops: [...] }`.
    const liste = Array.isArray(shops.body)
      ? shops.body
      : Array.isArray(shops.body?.shops)
        ? shops.body.shops
        : [];
    for (const shop of liste) {
      const clients = Array.isArray(shop.businessClients)
        ? shop.businessClients.map((c) => c.code).join(", ")
        : "";
      const pays = Array.isArray(shop.businessClients)
        ? [...new Set(shop.businessClients.map((c) => c.countryCode).filter(Boolean))].join(", ")
        : "";
      console.log(
        `  - ${shop.name} (${shop.id}) · pays ${pays || "—"} · clients commerciaux ${clients || "—"}`,
      );
    }

    const rattaches = await client.query(
      "SELECT name, remote_shop_id, remote_shop_name, country, currency FROM shops WHERE jumia_account_id = $1",
      [account.id],
    );
    console.log("boutiques rattachées à ce compte en base :");
    for (const row of rattaches.rows) {
      console.log(
        `  - ${row.name} · remote ${row.remote_shop_id} (${row.remote_shop_name ?? "—"}) · ${row.country} ${row.currency}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
