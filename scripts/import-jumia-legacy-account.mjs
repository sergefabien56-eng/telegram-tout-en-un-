import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";

/**
 * Migration de l'identifiant Jumia historique vers le multi-comptes.
 *
 * À usage unique : transforme les identifiants stockés dans `app_settings`
 * (`jumia_credentials`) en un véritable compte Jumia, puis rattache les
 * boutiques déjà liées à ce compte. Idempotent : relancer le script ne crée
 * pas de doublon.
 *
 * Usage :
 *   DATABASE_URL=… node scripts/import-jumia-legacy-account.mjs
 */

function loadEnvLocal() {
  const file = ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
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
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) return buf;
  return createHash("sha256").update(trimmed).digest();
}

function decryptText(payload, secret) {
  const parts = payload.split(":");
  if (parts.length !== 4) return null;
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== "v1") return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      resolveKey(secret),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.ENCRYPTION_KEY;
  if (!url) throw new Error("DATABASE_URL manquante.");
  if (!secret) throw new Error("ENCRYPTION_KEY manquante.");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const existing = await client.query("SELECT id FROM jumia_accounts LIMIT 1");
    if (existing.rowCount > 0) {
      console.log("Un compte Jumia existe déjà : rien à importer.");
      return;
    }

    const settings = await client.query(
      "SELECT value FROM app_settings WHERE key = 'jumia_credentials'",
    );
    const stored =
      settings.rowCount > 0 && typeof settings.rows[0].value === "string"
        ? settings.rows[0].value
        : null;
    if (!stored) {
      console.log("Aucun identifiant historique dans app_settings : rien à importer.");
      return;
    }

    const plain = decryptText(stored, secret);
    if (!plain) throw new Error("Identifiant historique illisible (ENCRYPTION_KEY différente ?).");
    const credentials = JSON.parse(plain);
    if (!credentials.clientId || !credentials.refreshToken) {
      throw new Error("Identifiant historique incomplet.");
    }

    // Échange pour récupérer l'e-mail du compte (revendication du JWT).
    let email = null;
    try {
      const response = await fetch("https://vendor-api.jumia.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: credentials.clientId,
          refresh_token: credentials.refreshToken,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const jwt = String(payload.access_token ?? "");
        const [, encoded] = jwt.split(".");
        if (encoded) {
          const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
          if (typeof claims.email === "string") email = claims.email;
        }
        if (typeof payload.refresh_token === "string" && payload.refresh_token) {
          credentials.refreshToken = payload.refresh_token;
        }
      }
    } catch {
      // L'e-mail reste facultatif si le test réseau échoue.
    }

    const shopRow = await client.query(
      "SELECT owner_user_id AS owner FROM shops WHERE remote_shop_id IS NOT NULL LIMIT 1",
    );
    if (shopRow.rowCount === 0) {
      console.log("Aucune boutique rattachée : aucun compte créé.");
      return;
    }

    const inserted = await client.query(
      `INSERT INTO jumia_accounts
         (owner_user_id, label, email, client_id, refresh_token_ciphertext, status, last_token_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now())
       RETURNING id`,
      [shopRow.rows[0].owner, "Compte principal", email, credentials.clientId, stored],
    );

    if (inserted.rowCount === 0) {
      console.log("Aucune boutique rattachée : aucun compte créé.");
      return;
    }

    const accountId = inserted.rows[0].id;
    const linked = await client.query(
      "UPDATE shops SET jumia_account_id = $1, updated_at = now() WHERE remote_shop_id IS NOT NULL AND jumia_account_id IS NULL RETURNING name",
      [accountId],
    );
    console.log(`Compte Jumia créé (${accountId}) pour ${email ?? "adresse inconnue"}.`);
    console.log(`Boutiques rattachées : ${(linked.rows ?? []).map((row) => row.name).join(", ") || "aucune"}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
