import { beforeAll, describe, expect, it } from "vitest";
import { createLinkCode, consumeLinkCode, findLinkedUser } from "@/lib/telegram-service";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";

/**
 * Tests d'intégration sur la base réelle (Neon).
 * Ignorés automatiquement si DATABASE_URL est absent (CI).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const TELEGRAM_ID = 987_654_321;

describe.skipIf(!hasDb)("liaison de compte Telegram (base réelle)", () => {
  let userId = "";

  beforeAll(async () => {
    const db = getDb();
    const email = `tg-int-${Date.now()}@exemple.ci`;
    const created = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash: hashPassword("MotDePasse123"),
        fullName: "Test Telegram",
      })
      .returning({ id: schema.users.id });
    userId = created[0]?.id ?? "";
  });

  it("génère un code puis le consomme pour lier le compte", async () => {
    const { code } = await createLinkCode(userId);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const result = await consumeLinkCode(code, {
      id: TELEGRAM_ID,
      username: "serge",
      firstName: "Serge",
    });
    expect(result.ok).toBe(true);

    const linked = await findLinkedUser(TELEGRAM_ID);
    expect(linked?.userId).toBe(userId);
  });

  it("un code consommé ne peut pas être réutilisé", async () => {
    const { code } = await createLinkCode(userId);
    expect((await consumeLinkCode(code, { id: TELEGRAM_ID + 1 })).ok).toBe(true);
    const second = await consumeLinkCode(code, { id: TELEGRAM_ID + 2 });
    expect(second.ok).toBe(false);
  });

  it("un code inconnu est refusé", async () => {
    expect((await consumeLinkCode("ZZZZZZZZ", { id: TELEGRAM_ID + 3 })).ok).toBe(false);
  });

  it("un compte non lié est introuvable", async () => {
    expect(await findLinkedUser(111_222_333)).toBeNull();
  });

  it("nettoie les données de test", async () => {
    const db = getDb();
    await db
      .delete(schema.telegramAccounts)
      .where(eq(schema.telegramAccounts.linkedUserId, userId));
    await db.delete(schema.accountLinkCodes).where(eq(schema.accountLinkCodes.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    expect(true).toBe(true);
  });
});
