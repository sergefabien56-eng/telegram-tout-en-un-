import { describe, expect, it } from "vitest";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";

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
    expect(registerSchema.safeParse({ email: "pas-un-email", password: "MotDePasse1", fullName: "AB" }).success).toBe(
      false,
    );
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
