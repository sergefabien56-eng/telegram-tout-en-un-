import { describe, expect, it } from "vitest";
import {
  buildTotpUri,
  consumeTwoFactorChallenge,
  generateRecoveryCodes,
  generateTotpSecret,
  generateTotpToken,
  hashRecoveryCode,
  isRecoveryCodeFormat,
  issueTwoFactorChallenge,
  normalizeRecoveryCode,
  verifyTotp,
} from "@/lib/totp";

describe("TOTP (2FA)", () => {
  it("génère un secret Base32 de 32 caractères", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("construit une URI otpauth:// correcte", () => {
    const uri = buildTotpUri("fabien@example.ci", "JBSWY3DPEHPK3PXP");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("issuer=TOUT%20EN%20UN");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("accepte le code courant", () => {
    const secret = generateTotpSecret();
    const token = generateTotpToken(secret);
    expect(verifyTotp(token, secret)).toEqual({ ok: true, delta: 0 });
  });

  // otplib exprime `epoch` en **secondes** (contrairement à Date.now()).
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it("accepte le code de la période précédente (fenêtre ±1)", async () => {
    const { generateSync } = await import("otplib");
    const secret = generateTotpSecret();
    const previous = generateSync({
      secret,
      digits: 6,
      period: 30,
      epoch: nowSeconds() - 30,
    });
    expect(verifyTotp(previous, secret).ok).toBe(true);
  });

  it("refuse un code vieux de deux périodes", async () => {
    const { generateSync } = await import("otplib");
    const secret = generateTotpSecret();
    const old = generateSync({ secret, digits: 6, period: 30, epoch: nowSeconds() - 120 });
    expect(verifyTotp(old, secret).ok).toBe(false);
  });

  it("refuse un code erroné", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("000000", secret).ok).toBe(false);
  });

  it("refuse un format invalide", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("ABC", secret).ok).toBe(false);
    expect(verifyTotp("", secret).ok).toBe(false);
  });

  it("tolère les espaces et les tirets dans la saisie", () => {
    const secret = generateTotpSecret();
    const token = generateTotpToken(secret);
    expect(verifyTotp(` ${token.slice(0, 3)}-${token.slice(3)} `, secret).ok).toBe(true);
  });
});

describe("codes de secours", () => {
  it("génère 8 codes au format ABCD-EFGH", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    for (const code of codes) expect(isRecoveryCodeFormat(code)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("normalise la saisie (casse, espaces, tirets)", () => {
    expect(normalizeRecoveryCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(hashRecoveryCode("abcd-efgh")).toBe(hashRecoveryCode(" ABCDEFGH "));
  });

  it("a un format refusé quand il est malformé", () => {
    expect(isRecoveryCodeFormat("123456789")).toBe(false);
  });
});

describe("challenge de connexion", () => {
  it("émet puis consomme un jeton valide", () => {
    const token = issueTwoFactorChallenge("user-1");
    expect(consumeTwoFactorChallenge(token)).toBe("user-1");
  });

  it("refuse un jeton falsifié", () => {
    const token = issueTwoFactorChallenge("user-1");
    const payload = token.split(".")[0] ?? "";
    const forged = `${payload}.${"A".repeat(payload.length)}`;
    expect(consumeTwoFactorChallenge(forged)).toBeNull();
  });

  it("refuse un jeton malformé ou vide", () => {
    expect(consumeTwoFactorChallenge("")).toBeNull();
    expect(consumeTwoFactorChallenge("abc")).toBeNull();
  });
});
