import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password (scrypt)", () => {
  it("hache puis vérifie un mot de passe correct", () => {
    const hash = hashPassword("MotDePasse123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("MotDePasse123", hash)).toBe(true);
  });

  it("rejette un mot de passe erroné", () => {
    const hash = hashPassword("MotDePasse123");
    expect(verifyPassword("Autre123", hash)).toBe(false);
  });

  it("produit deux hachages différents (sel aléatoire)", () => {
    expect(hashPassword("MotDePasse123")).not.toBe(hashPassword("MotDePasse123"));
  });

  it("rejette un format de hachage inconnu", () => {
    expect(verifyPassword("MotDePasse123", "md5$abcd")).toBe(false);
    expect(verifyPassword("MotDePasse123", "scrypt$1$1$1$a$b")).toBe(false);
  });
});
