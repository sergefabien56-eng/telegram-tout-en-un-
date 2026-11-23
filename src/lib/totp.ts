import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { generateSecret, generateSync, generateURI, verifySync } from "otplib";
import { sha256Hex } from "@/lib/crypto";

/**
 * 2FA TOTP (R4) — Compatible Google Authenticator, Authy, FreeOTP…
 *
 * - Le secret est généré côté serveur et stocké **chiffré** (AES-256-GCM).
 * - La vérification accepte une fenêtre de ±1 pas (30 s) pour absorber le
 *   décalage d'horloge.
 * - Des codes de secours à usage unique sont fournis ; seules leurs empreintes
 *   SHA-256 sont conservées.
 */

export const TOTP_ISSUER = "TOUT EN UN";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
/** Fenêtre de tolérance en pas de temps (1 = pas précédent/suivant acceptés). */
export const TOTP_WINDOW = 1;

/** Secret Base32 (20 octets) tel qu'attendu par les applications d'authentification. */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** URI `otpauth://` à encoder dans le QR code. */
export function buildTotpUri(email: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: email, secret });
}

export type TotpVerify = { ok: true; delta: number } | { ok: false };

/** Vérifie un code à 6 chiffres. */
export function verifyTotp(token: string, secret: string): TotpVerify {
  const cleaned = token.replace(/[\s-]/g, "").toUpperCase();
  if (!/^\d{6}$/.test(cleaned)) return { ok: false };
  const result = verifySync({
    token: cleaned,
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    // Tolérance symétrique exprimée en secondes (±1 pas de 30 s).
    epochTolerance: TOTP_PERIOD * TOTP_WINDOW,
  }) as { valid?: boolean; delta?: number } | undefined;

  if (!result || result.valid !== true) return { ok: false };
  return { ok: true, delta: typeof result.delta === "number" ? result.delta : 0 };
}

/** Génère un code de test (utilisé par les tests automatisés uniquement). */
export function generateTotpToken(secret: string): string {
  return generateSync({ secret, digits: TOTP_DIGITS, period: TOTP_PERIOD });
}

/* ---------------- Codes de secours ------------------------------------- */

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I, L, O, 0, 1

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) {
      code += RECOVERY_ALPHABET.charAt(byte % RECOVERY_ALPHABET.length);
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/** Normalise un code tapé par l'utilisateur. */
export function normalizeRecoveryCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Empreinte stockée en base (jamais le code en clair). */
export function hashRecoveryCode(value: string): string {
  return sha256Hex(normalizeRecoveryCode(value));
}

export function isRecoveryCodeFormat(value: string): boolean {
  return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(value.trim());
}

/* ---------------- Challenge de connexion (login → 2FA) ----------------- */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function challengeKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET est requis pour la 2FA.");
  return secret;
}

/** Jeton court (5 min) prouvant que le mot de passe a déjà été validé. */
export function issueTwoFactorChallenge(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + CHALLENGE_TTL_MS }),
  ).toString("base64url");
  const signature = createHmac("sha256", challengeKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Consomme le jeton : renvoie l'identifiant ou null (invalide/expiré). */
export function consumeTwoFactorChallenge(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const expected = createHmac("sha256", challengeKey()).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: string;
      exp?: number;
    };
    if (!data.uid || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}
