import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des secrets (R4).
 * Format stocké : `v1:<iv base64>:<tag base64>:<texte chiffré base64>`.
 *
 * La clé est fournie en hexadécimal (64 caractères) ou en base64.
 */
const PREFIX = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function resolveKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) return buf;
  // Empreinte SHA-256 de la clé fournie (accepte toute clé secrète).
  return createHash("sha256").update(trimmed).digest();
}

export function encryptText(plainText: string, secret: string): string {
  const key = resolveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

export function decryptText(payload: string, secret: string): string | null {
  const parts = payload.split(":");
  if (parts.length !== 4) return null;
  const [version, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  if (version !== PREFIX) return null;

  try {
    const key = resolveKey(secret);
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null;

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Empreinte SHA-256 (hex) — utilisée pour ne jamais stocker un token en clair. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Empreinte SHA-256 (hex) d'un contenu **binaire** — étiquettes PDF.
 *
 * L'empreinte prouve l'intégrité du document tel qu'il a été reçu : elle
 * est calculée sur les octets décodés, pas sur la chaîne base64 (dont
 * l'alphabet change la représentation sans changer le document).
 */
export function sha256HexOfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Génère une valeur aléatoire opaque (URL-safe). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
