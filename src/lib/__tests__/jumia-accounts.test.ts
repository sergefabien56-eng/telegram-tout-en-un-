import { describe, expect, it } from "vitest";
import { emailFromAccessToken } from "@/lib/jumia/client";
import { jumiaAccountSchema } from "@/lib/jumia/accounts";

/** Les comptes Jumia sont ajoutés depuis l'application : la saisie doit être sûre. */
describe("jumiaAccountSchema", () => {
  const base = {
    label: "Maxi Shop",
    clientId: "a3ec005d-43c1-4006-acf8-0e6d16ca0955",
    refreshToken: "rt-".padEnd(24, "x"),
  };

  it("accepte des identifiants complets", () => {
    expect(jumiaAccountSchema.safeParse(base).success).toBe(true);
  });

  it("accepte un e-mail facultatif", () => {
    expect(jumiaAccountSchema.safeParse({ ...base, email: "" }).success).toBe(true);
  });

  it("refuse un nom trop court", () => {
    const result = jumiaAccountSchema.safeParse({ ...base, label: "M" });
    expect(result.success).toBe(false);
  });

  it("refuse un e-mail malformé", () => {
    const result = jumiaAccountSchema.safeParse({ ...base, email: "pas-un-email" });
    expect(result.success).toBe(false);
  });

  it("refuse un client_id trop court (protection contre les valeurs collées à côté)", () => {
    const result = jumiaAccountSchema.safeParse({ ...base, clientId: "abc" });
    expect(result.success).toBe(false);
  });

  it("exige le refresh token", () => {
    const result = jumiaAccountSchema.safeParse({ ...base, refreshToken: undefined });
    expect(result.success).toBe(false);
  });
});

describe("emailFromAccessToken", () => {
  function jwt(payload: Record<string, unknown>) {
    const encode = (value: string) =>
      Buffer.from(value).toString("base64url").replace(/=+$/, "");
    return `${encode(JSON.stringify({ alg: "none" }))}.${encode(JSON.stringify(payload))}.signature`;
  }

  it("lit l'e-mail de la revendication du jeton", () => {
    expect(emailFromAccessToken(jwt({ email: "sergefabien56@gmail.com" }))).toBe(
      "sergefabien56@gmail.com",
    );
  });

  it("renvoie null quand le jeton n'est pas un JWT exploitable", () => {
    expect(emailFromAccessToken("")).toBeNull();
    expect(emailFromAccessToken("a.b")).toBeNull();
    expect(emailFromAccessToken(jwt({}))).toBeNull();
  });
});
