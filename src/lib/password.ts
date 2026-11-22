import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Hachage de mot de passe — scrypt (RFC 7914), nativement fourni par Node.
 *
 * Format stocké : `scrypt$n=16384$r=8$p=1$<sel base64>$<hachage base64>`
 * (n = coût CPU/mémoire, r = bloc, p = parallélisme).
 */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

const hashSchema = z.string().regex(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return [
    PREFIX,
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Vérifie un mot de passe de façon à temps constant.
 * Retourne `false` pour tout format inconnu ou paramètre incohérent.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = hashSchema.safeParse(stored);
  if (!parsed.success) return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parsed.data.split("$");
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;

  const salt = Buffer.from(saltB64 ?? "", "base64");
  const expected = Buffer.from(hashB64 ?? "", "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
