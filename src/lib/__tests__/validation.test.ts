import { describe, expect, it } from "vitest";
import {
  createShopSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
} from "@/lib/validation";

describe("création de boutique", () => {
  const base = { name: "Maxi Shop", country: "CI", currency: "XOF" };

  it("génère un identifiant interne quand aucun n'est fourni", () => {
    const result = createShopSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.externalShopId).toMatch(/^local-[a-z0-9]+$/);
      expect(result.data.name).toBe("Maxi Shop");
    }
  });

  it("conserve un identifiant fourni par l'utilisateur", () => {
    const result = createShopSchema.safeParse({ ...base, externalShopId: "MAXI-001" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.externalShopId).toBe("MAXI-001");
  });

  it("exige au moins un nom", () => {
    expect(createShopSchema.safeParse({ ...base, name: "M" }).success).toBe(false);
  });
});

describe("validation des entrées", () => {
  it("accepte une inscription valide", () => {
    const result = registerSchema.safeParse({
      email: "  User@Exemple.CI ",
      password: "MotDePasse123",
      fullName: "Serge Fabien",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@exemple.ci");
  });

  it("rejette un e-mail invalide", () => {
    expect(
      registerSchema.safeParse({ email: "pas-un-email", password: "MotDePasse1", fullName: "AB" })
        .success,
    ).toBe(false);
  });

  it("exige une lettre et un chiffre dans le mot de passe", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("motdepasse").success).toBe(false);
    expect(passwordSchema.safeParse("motdepasse1").success).toBe(true);
    expect(passwordSchema.safeParse("court1").success).toBe(false);
  });

  it("rejette une connexion sans mot de passe", () => {
    expect(loginSchema.safeParse({ email: "a@b.ci", password: "" }).success).toBe(false);
  });
});
