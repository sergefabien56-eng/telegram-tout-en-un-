import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText, generateToken, sha256Hex } from "@/lib/crypto";

const SECRET = randomBytes(32).toString("hex");

describe("crypto (AES-256-GCM)", () => {
  it("chiffre puis déchiffre un texte", () => {
    const payload = encryptText("Donnée secrète", SECRET);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(decryptText(payload, SECRET)).toBe("Donnée secrète");
  });

  it("ne déchiffre pas avec la mauvaise clé", () => {
    const payload = encryptText("Donnée secrète", SECRET);
    expect(decryptText(payload, randomBytes(32).toString("hex"))).toBeNull();
  });

  it("retourne null pour un payload altéré ou malformé", () => {
    const payload = encryptText("Donnée secrète", SECRET);
    const tampered = payload.slice(0, -2) + "AA";
    expect(decryptText(tampered, SECRET)).toBeNull();
    expect(decryptText("v1:malformed", SECRET)).toBeNull();
  });

  it("produit des chiffrés différents (IV aléatoire)", () => {
    expect(encryptText("même texte", SECRET)).not.toBe(encryptText("même texte", SECRET));
  });
});

describe("helpers", () => {
  it("sha256Hex est déterministe", () => {
    expect(sha256Hex("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("generateToken est opaque et unique", () => {
    expect(generateToken()).not.toBe(generateToken());
    expect(generateToken().length).toBeGreaterThan(20);
  });
});
