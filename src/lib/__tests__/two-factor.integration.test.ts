import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { generateTotpToken } from "@/lib/totp";
import {
  checkSecondFactor,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  startTwoFactorSetup,
} from "@/lib/two-factor";
import { eq } from "drizzle-orm";

/** Flux complet 2FA sur la base réelle (ignoré en CI). */
const hasDb = Boolean(process.env.DATABASE_URL && process.env.ENCRYPTION_KEY);

describe.skipIf(!hasDb)("double authentification (base réelle)", () => {
  const suffix = Date.now();
  const email = `2fa-${suffix}@exemple.ci`;
  let userId = "";
  let secret = "";

  beforeAll(async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: hashPassword("MotDePasse123"), fullName: "2FA Test" })
      .returning({ id: schema.users.id });
    if (!user) throw new Error("Création impossible.");
    userId = user.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("est désactivée au départ", async () => {
    expect(await getTwoFactorStatus(userId)).toEqual({ enabled: false });
  });

  it("démarre un paramétrage sans activer", async () => {
    const setup = await startTwoFactorSetup(userId);
    secret = setup.secret;
    expect(setup.uri).toContain("otpauth://totp/");
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await getTwoFactorStatus(userId)).enabled).toBe(false);
  });

  it("refuse un mauvais code à la confirmation", async () => {
    const result = await confirmTwoFactorSetup(userId, "000000");
    expect(result.ok).toBe(false);
    expect((await getTwoFactorStatus(userId)).enabled).toBe(false);
  });

  it("active avec le bon code et renvoie des codes de secours", async () => {
    const token = generateTotpToken(secret);
    const result = await confirmTwoFactorSetup(userId, token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recoveryCodes).toHaveLength(8);
      expect(result.recoveryCodes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    expect((await getTwoFactorStatus(userId)).enabled).toBe(true);
  });

  it("accepte un code TOTP à la connexion", async () => {
    const result = await checkSecondFactor(userId, generateTotpToken(secret));
    expect(result.ok).toBe(true);
  });

  it("consomme un code de secours une seule fois", async () => {
    // Repart d'un paramétrage complet pour obtenir des codes de secours neufs.
    expect((await disableTwoFactor(userId, "MotDePasse123")).ok).toBe(true);
    const fresh = await startTwoFactorSetup(userId);
    const activated = await confirmTwoFactorSetup(userId, generateTotpToken(fresh.secret));
    if (!activated.ok) throw new Error("Activation impossible.");

    const code = activated.recoveryCodes[0];
    if (!code) throw new Error("Aucun code de secours généré.");

    const first = await checkSecondFactor(userId, code);
    expect(first.ok).toBe(true);
    expect(first.ok && first.usedRecovery).toBe(true);

    const second = await checkSecondFactor(userId, code);
    expect(second.ok).toBe(false);
  });

  it("désactive après vérification du mot de passe", async () => {
    expect((await disableTwoFactor(userId, "mauvais")).ok).toBe(false);
    expect((await disableTwoFactor(userId, "MotDePasse123")).ok).toBe(true);
    expect(await getTwoFactorStatus(userId)).toEqual({ enabled: false });
  });
});
