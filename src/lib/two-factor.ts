import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db";
import { decryptText, encryptText } from "@/lib/crypto";
import { verifyPassword } from "@/lib/password";
import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  isRecoveryCodeFormat,
  normalizeRecoveryCode,
  verifyTotp,
} from "@/lib/totp";

/** Service 2FA — le secret est toujours stocké chiffré, jamais en clair. */

function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY n'est pas configuré.");
  return key;
}

async function readUserRow(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      passwordHash: schema.users.passwordHash,
      enabled: schema.users.twoFactorEnabled,
      secretEnc: schema.users.twoFactorSecretEnc,
      recoveryCodes: schema.users.twoFactorRecoveryCodes,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTwoFactorStatus(userId: string): Promise<{ enabled: boolean }> {
  const user = await readUserRow(userId);
  return { enabled: Boolean(user?.enabled) };
}

/**
 * Étape 1 du paramétrage : génère un secret et son QR code.
 * Le secret est stocké chiffré mais la 2FA reste **désactivée** jusqu'à la
 * confirmation (aucun impact sur la connexion en cours).
 */
export async function startTwoFactorSetup(userId: string): Promise<{
  secret: string;
  uri: string;
  qrDataUrl: string;
}> {
  const user = await readUserRow(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  if (user.enabled) throw new Error("La 2FA est déjà activée.");

  const secret = generateTotpSecret();
  const uri = buildTotpUri(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 240,
    color: { dark: "#101C39", light: "#FFFFFF" },
  });

  const db = getDb();
  await db
    .update(schema.users)
    .set({
      twoFactorSecretEnc: encryptText(secret, encryptionKey()),
      twoFactorRecoveryCodes: null,
      twoFactorConfirmedAt: null,
    })
    .where(eq(schema.users.id, userId));

  return { secret, uri, qrDataUrl };
}

/**
 * Étape 2 : vérifie le premier code, active la 2FA et renvoie les codes de
 * secours **à afficher une seule fois**.
 */
export async function confirmTwoFactorSetup(
  userId: string,
  token: string,
): Promise<
  | {
      ok: true;
      recoveryCodes: string[];
    }
  | { ok: false; reason: string }
> {
  const user = await readUserRow(userId);
  if (!user) return { ok: false, reason: "Utilisateur introuvable." };
  if (user.enabled) return { ok: false, reason: "La 2FA est déjà activée." };
  if (!user.secretEnc) return { ok: false, reason: "Aucun paramétrage en cours." };

  const secret = decryptText(user.secretEnc, encryptionKey());
  if (!secret) return { ok: false, reason: "Secret illisible." };

  const verified = verifyTotp(token, secret);
  if (!verified.ok) return { ok: false, reason: "Code incorrect." };

  const recoveryCodes = generateRecoveryCodes(8);
  const hashes = recoveryCodes.map((code) => hashRecoveryCode(code));

  const db = getDb();
  await db
    .update(schema.users)
    .set({
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: hashes,
      twoFactorConfirmedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  return { ok: true, recoveryCodes };
}

/** Désactive la 2FA après vérification du mot de passe. */
export async function disableTwoFactor(
  userId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await readUserRow(userId);
  if (!user) return { ok: false, reason: "Utilisateur introuvable." };
  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, reason: "Mot de passe incorrect." };
  }

  const db = getDb();
  await db
    .update(schema.users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecretEnc: null,
      twoFactorRecoveryCodes: null,
      twoFactorConfirmedAt: null,
    })
    .where(eq(schema.users.id, userId));

  return { ok: true };
}

/**
 * Vérifie le second facteur à la connexion : code TOTP d'abord, puis code de
 * secours (consommé immédiatement, usage unique).
 */
export async function checkSecondFactor(
  userId: string,
  token: string,
): Promise<{ ok: true; usedRecovery: boolean } | { ok: false; reason: string }> {
  const user = await readUserRow(userId);
  if (!user) return { ok: false, reason: "Utilisateur introuvable." };
  if (!user.enabled) return { ok: true, usedRecovery: false };
  if (!user.secretEnc) return { ok: false, reason: "2FA mal configurée." };

  const secret = decryptText(user.secretEnc, encryptionKey());

  // 1) Code TOTP
  if (secret && /^\d{6}$/.test(token.replace(/\s/g, ""))) {
    const verified = verifyTotp(token, secret);
    if (verified.ok) return { ok: true, usedRecovery: false };
  }

  // 2) Code de secours (format ABCD-EFGH)
  if (isRecoveryCodeFormat(token)) {
    const digest = hashRecoveryCode(token);
    const stored = user.recoveryCodes ?? [];
    const index = stored.indexOf(digest);
    if (index !== -1) {
      const remaining = stored.filter((_, i) => i !== index);
      const db = getDb();
      await db
        .update(schema.users)
        .set({ twoFactorRecoveryCodes: remaining })
        .where(eq(schema.users.id, userId));
      return { ok: true, usedRecovery: true };
    }
    return { ok: false, reason: "Code de secours invalide ou déjà utilisé." };
  }

  return { ok: false, reason: "Code à 6 chiffres attendu." };
}

/** Normalise la saisie pour l'affichage des codes de secours. */
export function displayRecoveryCode(value: string): string {
  return normalizeRecoveryCode(value);
}
